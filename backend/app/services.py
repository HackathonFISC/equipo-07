import hashlib
import json
import time
from datetime import timedelta
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app.contracts import PlanRequest, PlanReviewInput, ReportInput, ReviewInput
from app.models import (
    Association,
    Community,
    DistributionPlan,
    Execution,
    Incident,
    Proposal,
    RateLimit,
    Report,
    Review,
    Trace,
    now,
)


class Conflict(ValueError):
    pass


class Missing(ValueError):
    pass


class Invalid(ValueError):
    pass


DATA = Path(__file__).resolve().parents[2] / "data"


def trace(session, execution_id, agent, event, *, tool=None, category="technical", **detail):
    session.add(
        Trace(
            execution_id=execution_id,
            agent=agent,
            tool=tool,
            event=event,
            category=category,
            detail=detail,
        )
    )


async def submit_report(db, body: ReportInput, key: str, settings):
    digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    async with db.sessions.begin() as session:
        existing = await session.get(Report, key)
        if existing:
            if existing.payload_hash != digest:
                raise Conflict("Idempotency-Key ya utilizado para otro reporte")
            return await session.get(Execution, key)
        if not await session.get(Community, body.community_id):
            raise Missing("Comunidad desconocida; selecciona un sector del catálogo")
        session.add(Report(id=key, payload_hash=digest, **body.model_dump()))
        await session.flush()
        execution = Execution(
            id=key,
            report_id=key,
            provider=(
                "mock-deterministic"
                if settings.llm_provider == "mock"
                else f"nvidia:{settings.nvidia_model}"
            ),
            is_simulated=settings.llm_provider == "mock",
            status="QUEUED",
        )
        session.add(execution)
        await session.flush()
        trace(session, key, "api", "REPORT_ACCEPTED", tool="save_report", category="audit")
        return execution


async def enqueue_review(db, execution_id: str, body: ReviewInput):
    async with db.sessions.begin() as session:
        execution = await session.get(Execution, execution_id)
        if not execution:
            raise Missing("Ejecución no encontrada")
        existing = await session.get(Review, execution_id)
        if existing:
            if existing.payload != body.model_dump():
                raise Conflict("La decisión ya fue registrada y no puede sobrescribirse")
            return execution
        association = await session.get(Association, execution.report_id)
        if association and association.status == "PENDING_REVIEW":
            if body.decision != "REJECT" and body.association is None:
                raise Conflict("Resuelve la asociación tentativa: CONFIRM o NEW")
        elif body.association is not None:
            raise Conflict("Esta ejecución no tiene una asociación tentativa")
        result = await session.execute(
            update(Execution)
            .where(Execution.id == execution_id, Execution.status == "WAITING_APPROVAL")
            .values(status="RESUME_QUEUED")
        )
        if result.rowcount != 1:
            raise Conflict("La ejecución todavía no espera aprobación")
        session.add(Review(execution_id=execution_id, payload=body.model_dump()))
        trace(
            session,
            execution_id,
            "human",
            "REVIEW_ACCEPTED",
            category="audit",
            decision=body.decision,
        )
        await session.refresh(execution)
        return execution


async def retry_execution(db, execution_id):
    async with db.sessions.begin() as session:
        result = await session.execute(
            update(Execution)
            .where(Execution.id == execution_id, Execution.status == "ERROR")
            .values(status="QUEUED", error=None)
        )
        if not result.rowcount:
            raise Conflict("Solo se pueden reintentar ejecuciones ERROR")
        trace(session, execution_id, "human", "RETRY_REQUESTED", category="audit")


async def rate_limit(db, address, limit):
    # Shared DB limit; do not trust X-Forwarded-For from unconfigured proxies.
    key = hashlib.sha256(address.encode()).hexdigest()
    window = int(time.time()) // 60
    for _ in range(2):
        try:
            async with db.sessions.begin() as session:
                await session.execute(delete(RateLimit).where(RateLimit.window < window - 1))
                result = await session.execute(
                    update(RateLimit)
                    .where(
                        RateLimit.key == key, RateLimit.window == window, RateLimit.count < limit
                    )
                    .values(count=RateLimit.count + 1)
                )
                if result.rowcount:
                    return True
                if await session.get(RateLimit, key):
                    result = await session.execute(
                        update(RateLimit)
                        .where(RateLimit.key == key, RateLimit.window < window)
                        .values(window=window, count=1)
                    )
                    return bool(result.rowcount)
                session.add(RateLimit(key=key, window=window, count=1))
            return True
        except IntegrityError:
            continue
    return False


async def candidate_incidents(session, report, window_hours):
    rows = (
        await session.scalars(
            select(Incident)
            .where(
                Incident.community_id == report.community_id,
                Incident.status.in_(["OPEN", "PRIORITIZED", "SCHEDULED"]),
                Incident.last_activity >= now() - timedelta(hours=window_hours),
            )
            .order_by(Incident.last_activity.desc(), Incident.id)
            .limit(20)
        )
    ).all()
    return [
        {"id": i.id, "community_id": i.community_id, "kind": i.kind, "summary": i.summary}
        for i in rows
    ]


async def apply_decision(db, execution_id, body: ReviewInput):
    async with db.sessions.begin() as session:
        review = await session.get(Review, execution_id)
        if review is None or review.payload != body.model_dump():
            raise Conflict("La reanudación no coincide con la revisión autorizada")
        if review.applied_at:
            return
        execution = await session.get(Execution, execution_id)
        proposal = await session.get(Proposal, execution_id)
        report = await session.get(Report, execution.report_id)
        association = await session.get(Association, report.id)
        if association.status == "PENDING_REVIEW":
            if body.decision == "REJECT":
                association.status = "REJECTED"
            elif body.association == "NEW":
                incident = Incident(
                    community_id=report.community_id,
                    kind=report.normalized["kind"],
                    summary=report.description,
                )
                session.add(incident)
                await session.flush()
                association.incident_id = incident.id
                proposal.incident_id = incident.id
                association.status = "CONFIRMED"
            else:
                association.status = "CONFIRMED"
        # Only the worker publishes a terminal status after the final checkpoint is durable.
        proposal.final_score = (
            None
            if body.decision == "REJECT"
            else body.corrected_score
            if body.decision == "CORRECT"
            else proposal.priority["score_min"]
        )
        if body.decision != "REJECT":
            incident = await session.get(Incident, association.incident_id)
            incident.status = "PRIORITIZED"
            incident.last_activity = now()
        review.applied_at = now()
        trace(
            session,
            execution_id,
            "human",
            "DECISION_APPLIED",
            tool="save_decision",
            category="audit",
            decision=body.decision,
            final_score=proposal.final_score,
            policy_version=proposal.priority["policy_version"],
            incident_id=proposal.incident_id,
        )


def record_dict(record):
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


async def execution_detail(db, execution_id):
    async with db.sessions() as session:
        execution = await session.get(Execution, execution_id)
        if not execution:
            raise Missing("Ejecución no encontrada")
        proposal = await session.get(Proposal, execution_id)
        review = await session.get(Review, execution_id)
        association = await session.get(Association, execution.report_id)
        events = (
            await session.scalars(
                select(Trace).where(Trace.execution_id == execution_id).order_by(Trace.id)
            )
        ).all()
        return {
            **record_dict(execution),
            "proposal": record_dict(proposal) if proposal else None,
            "review": record_dict(review) if review else None,
            "association": record_dict(association) if association else None,
            "traces": [record_dict(e) for e in events],
        }


def log_event(**data):
    print(json.dumps({"timestamp": now().isoformat() + "Z", **data}), flush=True)


def fleet_catalog():
    """Operational fields only: driver identity and contact data never leave the data file."""
    fleet = json.loads((DATA / "tanker_fleet.json").read_text("utf-8"))
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "capacity_gallons": t["capacity_gallons"],
            "base_plant_id": t["base_plant_id"],
            "status": t["current_status"],
            "shift_start": t["driver"]["shift_hours"]["start"],
            "shift_end": t["driver"]["shift_hours"]["end"],
            "discharge_flow_rate_gpm": t["discharge_flow_rate_gpm"],
            "refill_time_minutes": t["refill_time_minutes"],
            "setup_and_coupling_time_minutes": t["setup_and_coupling_time_minutes"],
            "fuel_consumption_km_per_gal": t["fuel_consumption_km_per_gal"],
            "operational_role": t["operational_role"],
        }
        for t in fleet["trucks"]
    ]


def location_catalog():
    features = json.loads((DATA / "panama_oeste_locations.geojson").read_text("utf-8"))
    return {
        f["properties"]["id"]: {
            **f["properties"],
            "lng": f["geometry"]["coordinates"][0],
            "lat": f["geometry"]["coordinates"][1],
        }
        for f in features["features"]
    }


def plan_event(plan, agent, event, *, tool=None, **detail):
    plan.events = [
        *plan.events,
        {"agent": agent, "tool": tool, "event": event, "detail": detail, "at": now().isoformat()},
    ]


async def request_plan(db, body: PlanRequest):
    known = {t["id"] for t in fleet_catalog()}
    unknown = sorted(set(body.unavailable_trucks) - known)
    if unknown:
        raise Invalid(f"Cisternas desconocidas: {', '.join(unknown)}")
    async with db.sessions.begin() as session:
        pending = await session.scalar(
            select(DistributionPlan).where(
                DistributionPlan.status.in_(["QUEUED", "RUNNING", "PROPOSED"])
            )
        )
        if pending:
            raise Conflict("Ya hay un plan en preparación o esperando revisión")
        plan = DistributionPlan(
            request={"unavailable_trucks": sorted(set(body.unavailable_trucks))}, events=[]
        )
        plan_event(plan, "human", "PLAN_REQUESTED", **plan.request)
        session.add(plan)
        await session.flush()
        return record_dict(plan)


async def review_plan(db, plan_id, body: PlanReviewInput):
    async with db.sessions.begin() as session:
        plan = await session.get(DistributionPlan, plan_id)
        if not plan:
            raise Missing("Plan no encontrado")
        if plan.review is not None:
            if plan.review != body.model_dump():
                raise Conflict("El plan ya fue revisado y la decisión no puede sobrescribirse")
            return record_dict(plan)
        if plan.status != "PROPOSED":
            raise Conflict("El plan todavía no espera revisión")
        plan.review = body.model_dump()
        plan.status = "APPROVED" if body.decision == "APPROVE" else "REJECTED"
        scheduled = []
        if body.decision == "APPROVE":
            ids = {i for r in plan.result["routes"] for s in r["stops"] for i in s["incident_ids"]}
            for incident in (
                await session.scalars(select(Incident).where(Incident.id.in_(ids)))
            ).all():
                # Programado no significa entregado: la entrega real se confirma fuera del sistema.
                incident.status = "SCHEDULED"
                incident.last_activity = now()
                scheduled.append(incident.id)
        plan_event(
            plan,
            "human",
            "PLAN_REVIEWED",
            tool="save_plan_decision",
            decision=body.decision,
            reason=body.reason,
            scheduled_incidents=len(scheduled),
        )
        return record_dict(plan)


async def latest_plan(db):
    async with db.sessions() as session:
        plan = await session.scalar(
            select(DistributionPlan)
            .order_by(DistributionPlan.created_at.desc(), DistributionPlan.id)
            .limit(1)
        )
        return record_dict(plan) if plan else None
