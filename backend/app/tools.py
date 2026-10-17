"""Finite, transactional operations available to agents; never exposed as LLM tools."""

from sqlalchemy import func, select

from app.contracts import (
    DuplicateEvaluationSchema,
    NormalizedReportSchema,
    PlanResult,
    PriorityResult,
)
from app.domain import is_critical_location
from app.models import (
    Association,
    Community,
    DistributionPlan,
    Incident,
    Notification,
    Proposal,
    Report,
    now,
)
from app.providers import ProviderError
from app.services import (
    candidate_incidents,
    fleet_catalog,
    location_catalog,
    plan_event,
    record_dict,
    trace,
)


class AgentTools:
    def __init__(self, db, window_hours):
        self._db, self._window_hours = db, window_hours

    async def report_context(self, key):
        async with self._db.sessions() as session:
            report = await session.get(Report, key)
            community = await session.get(Community, report.community_id)
            locations = location_catalog()
            loc = locations.get(report.community_id)
            in_catalog = loc is not None
            catalog_critical = is_critical_location(loc) if in_catalog else None
            return {
                "description": report.description,
                "community_id": report.community_id,
                "hours_without_water": report.hours_without_water,
                "duration_bucket": report.duration_bucket,
                "normalized": report.normalized,
                "population": community.population,
                "vulnerability": community.vulnerability,
                "is_synthetic": community.is_synthetic,
                "in_catalog": in_catalog,
                "catalog_critical": catalog_critical,
            }

    async def save_normalized(self, key, normalized: NormalizedReportSchema):
        async with self._db.sessions.begin() as session:
            report = await session.get(Report, key)
            if report.normalized is None:
                report.normalized = normalized.model_dump()
                trace(
                    session,
                    key,
                    "ingestion",
                    "NORMALIZED",
                    tool="save_normalized_report",
                    kind=normalized.kind,
                    flags=normalized.flags,
                )
            return report.normalized

    async def association(self, key):
        async with self._db.sessions() as session:
            existing = await session.get(Association, key)
            return (
                {"incident_id": existing.incident_id, "association_status": existing.status}
                if existing
                else None
            )

    async def candidates(self, key):
        async with self._db.sessions() as session:
            report = await session.get(Report, key)
            return await candidate_incidents(session, report, self._window_hours)

    async def consolidate(self, key, assessment: DuplicateEvaluationSchema):
        async with self._db.sessions.begin() as session:
            existing = await session.get(Association, key)
            if existing:
                return {"incident_id": existing.incident_id, "association_status": existing.status}
            report = await session.get(Report, key)
            candidates = await candidate_incidents(session, report, self._window_hours)
            matched = (
                str(assessment.matched_incident_id) if assessment.matched_incident_id else None
            )
            if matched:
                candidate = next((c for c in candidates if c["id"] == matched), None)
                if candidate is None:
                    raise ProviderError("INVALID_DUPLICATE_CANDIDATE")
                if candidate["kind"] != report.normalized["kind"]:
                    raise ProviderError("INCOMPATIBLE_INCIDENT_TYPE")
            else:
                incident = Incident(
                    community_id=report.community_id,
                    kind=report.normalized["kind"],
                    summary=report.description,
                )
                session.add(incident)
                await session.flush()
                matched = incident.id
            if (
                assessment.match_confidence == "HIGH"
                and "CONTRADICCION_DURACION" in report.normalized["flags"]
            ):
                assessment = assessment.model_copy(
                    update={
                        "match_confidence": "MEDIUM",
                        "reasoning": "Duración contradictoria; requiere confirmar la asociación",
                    }
                )
            status = "PENDING_REVIEW" if assessment.match_confidence == "MEDIUM" else "CONFIRMED"
            session.add(
                Association(
                    report_id=key,
                    incident_id=matched,
                    status=status,
                    reasoning=assessment.reasoning,
                    confidence=assessment.match_confidence,
                )
            )
            if status == "CONFIRMED":
                incident = await session.get(Incident, matched)
                incident.last_activity = now()
            trace(
                session,
                key,
                "verification",
                "CONSOLIDATED",
                tool="consolidate_incident",
                category="audit",
                incident_id=matched,
                association_status=status,
                confidence=assessment.match_confidence,
                reasoning=assessment.reasoning,
                candidates=len(candidates),
            )
            return {"incident_id": matched, "association_status": status}

    async def priority(self, key):
        async with self._db.sessions() as session:
            proposal = await session.get(Proposal, key)
            return proposal.priority if proposal else None

    async def save_proposal(self, key, priority: PriorityResult, explanation: str):
        async with self._db.sessions.begin() as session:
            proposal = await session.get(Proposal, key)
            if proposal is None:
                association = await session.get(Association, key)
                proposal = Proposal(
                    execution_id=key,
                    incident_id=association.incident_id,
                    priority=priority.model_dump(),
                    explanation=explanation,
                )
                session.add(proposal)
                trace(
                    session,
                    key,
                    "coordination",
                    "PROPOSED",
                    tool="calculate_priority",
                    category="audit",
                    **priority.model_dump(),
                )
            return proposal.priority


class PlannerTools:
    def __init__(self, db):
        self._db = db

    async def planning_inputs(self, plan_id):
        """Incidents a coordinator already prioritized, with their approved score."""
        async with self._db.sessions() as session:
            plan = await session.get(DistributionPlan, plan_id)
            rows = (
                await session.execute(
                    select(Incident, Proposal.final_score, Community.name)
                    .join(Proposal, Proposal.incident_id == Incident.id)
                    .join(Community, Community.id == Incident.community_id)
                    .where(Incident.status == "PRIORITIZED", Proposal.final_score.is_not(None))
                    .order_by(Incident.id)
                )
            ).all()
            incidents: dict[str, dict] = {}
            for incident, score, name in rows:
                item = incidents.setdefault(
                    incident.id,
                    {**record_dict(incident), "community_name": name, "score": score},
                )
                item["score"] = max(item["score"], score)

            assoc_data = (
                await session.execute(
                    select(
                        Association.incident_id,
                        func.count(Association.report_id).label("report_count"),
                        func.min(Report.created_at).label("first_report_at"),
                    )
                    .join(Report, Report.id == Association.report_id)
                    .group_by(Association.incident_id)
                )
            ).all()
            assoc_map = {r.incident_id: (r.report_count, r.first_report_at) for r in assoc_data}
            for inc_id, item in incidents.items():
                if inc_id in assoc_map:
                    item["report_count"], item["first_report_at"] = assoc_map[inc_id]
                else:
                    item["report_count"] = 1
                    item["first_report_at"] = item.get("created_at")

            return {
                "request": plan.request,
                "incidents": list(incidents.values()),
                "fleet": fleet_catalog(),
                "locations": location_catalog(),
            }

    async def save_plan(self, plan_id, result: PlanResult):
        async with self._db.sessions.begin() as session:
            plan = await session.get(DistributionPlan, plan_id)
            if plan.result is None:
                plan.result = result.model_dump()
                plan_event(
                    plan,
                    "planner",
                    "PLAN_PROPOSED",
                    tool="plan_distribution",
                    policy_version=result.policy_version,
                    routes=len(result.routes),
                    unserved=len(result.unserved),
                    planned_gallons=result.planned_gallons,
                    demand_gallons=result.demand_gallons,
                )
            return plan.result


class CommunicationTools:
    def __init__(self, db):
        self._db = db

    async def plan_context(self, plan_id: str):
        async with self._db.sessions() as session:
            plan = await session.get(DistributionPlan, plan_id)
            if not plan:
                return None
            return {
                "plan": record_dict(plan),
                "locations": location_catalog(),
            }

    async def save_notifications(self, plan_id: str, notifications: list[dict]):
        async with self._db.sessions.begin() as session:
            plan = await session.get(DistributionPlan, plan_id)
            if not plan:
                return []
            saved = []
            for item in notifications:
                existing = await session.scalar(
                    select(Notification).where(
                        Notification.plan_id == plan_id,
                        Notification.community_id == item["community_id"],
                    )
                )
                if existing is None:
                    row = Notification(
                        plan_id=plan_id,
                        community_id=item["community_id"],
                        incident_ids=item["incident_ids"],
                        kind=item["kind"],
                        text=item["text"],
                        arrival=item.get("arrival"),
                        status="READY",
                    )
                    session.add(row)
                    saved.append(row)
                else:
                    saved.append(existing)
            await session.flush()
            if not any(
                e.get("agent") == "communication" and e.get("event") == "NOTIFICATIONS_GENERATED"
                for e in plan.events
            ):
                plan_event(
                    plan,
                    "communication",
                    "NOTIFICATIONS_GENERATED",
                    tool="save_notifications",
                    count=len(saved),
                )
            return [record_dict(r) for r in saved]
