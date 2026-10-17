from uuid import UUID

from app.contracts import (
    DuplicateEvaluationSchema,
    NormalizedReportSchema,
    PlanDemand,
    PlanTruck,
    UnservedDemand,
    plain,
)
from app.domain import calculate_priority, is_critical_location, resolve_criticality
from app.grounding import critical_evidence, extract_temporal_grounding
from app.planner import plan_distribution
from app.providers import ProviderError
from app.tools import AgentTools, PlannerTools


class Agents:
    def __init__(self, db, provider, settings):
        self.tools = AgentTools(db, settings.dedup_window_hours)
        self.provider = provider

    async def ingest(self, state):
        key = state["execution_id"]
        report = await self.tools.report_context(key)
        if report["normalized"] is not None:
            return {"normalized": report["normalized"]}
        normalized = await self.provider.extract_report(report["description"])
        temporal = extract_temporal_grounding(report["description"])
        observed = temporal.hours
        if (
            normalized.hours_without_water is not None
            and normalized.hours_without_water not in observed
        ):
            if temporal.is_imprecise:
                normalized.hours_without_water = None
                if "DURACION_IMPRECISA" not in normalized.flags:
                    normalized.flags.append("DURACION_IMPRECISA")
            else:
                raise ProviderError("UNGROUNDED_HOURS")
        critical = critical_evidence(report["description"])
        if normalized.critical_institution is True and critical is not True:
            raise ProviderError("UNGROUNDED_CRITICAL_INSTITUTION")
        normalized.critical_institution = critical
        if len(set(observed)) > 1 or (
            report["hours_without_water"] is not None
            and observed
            and any(h != report["hours_without_water"] for h in observed)
        ):
            normalized.flags.append("CONTRADICCION_DURACION")
            normalized.hours_without_water = None
        elif report["hours_without_water"] is not None:
            normalized.hours_without_water = report["hours_without_water"]
        if any(h > 2160 for h in observed):
            normalized.flags.append("DURACION_FUERA_DE_RANGO")
            normalized.hours_without_water = None
        normalized.summary = report["description"]
        return {"normalized": await self.tools.save_normalized(key, normalized)}

    async def verify(self, state):
        key, normalized = state["execution_id"], state["normalized"]
        existing = await self.tools.association(key)
        if existing:
            return existing
        candidates = await self.tools.candidates(key)
        exact = [
            c
            for c in candidates
            if plain(c["summary"]) == plain(normalized["summary"])
            and c["kind"] == normalized["kind"]
        ]
        if len(exact) == 1:
            assessment = DuplicateEvaluationSchema(
                match_confidence="HIGH",
                matched_incident_id=UUID(exact[0]["id"]),
                reasoning="Texto, tipo y sector coincidentes",
            )
        else:
            assessment = await self.provider.evaluate_duplicate(normalized, candidates)
        return await self.tools.consolidate(key, assessment)

    async def coordinate(self, state):
        key = state["execution_id"]
        existing = await self.tools.priority(key)
        if existing:
            return {"priority": existing}
        context = await self.tools.report_context(key)
        normalized = NormalizedReportSchema.model_validate(state["normalized"])
        effective_critical, crit_flags = resolve_criticality(
            normalized.critical_institution,
            context.get("in_catalog", False),
            context.get("catalog_critical"),
        )
        # Snapshot of this report: duplicate volume never contributes to the score.
        priority = calculate_priority(
            normalized.hours_without_water,
            effective_critical,
            context["vulnerability"],
            context["population"],
        )
        priority.flags.extend(normalized.flags)
        priority.flags.extend(crit_flags)
        if context["is_synthetic"]:
            priority.flags.append("DATOS_SECTOR_SINTETICOS")
        if state["association_status"] == "PENDING_REVIEW":
            priority.flags.append("ASOCIACION_TENTATIVA")
        result = await self.provider.explain_priority_proposal(
            {"id": state["incident_id"], "kind": normalized.kind}, priority.model_dump()
        )
        return {"priority": await self.tools.save_proposal(key, priority, result.explanation)}


SKIP_DETAIL = {
    "FUGA_REQUIERE_REPARACION": "Una fuga se resuelve con una cuadrilla de reparación, "
    "no con una cisterna.",
    "SIN_UBICACION": "El sector no tiene coordenadas en el catálogo geográfico; "
    "no se inventa una ubicación.",
    "SIN_DEMANDA_ESTIMADA": "El catálogo no estima la demanda diaria de este punto.",
}


class PlannerAgent:
    """Turns human-approved priorities into a tanker plan; the solver is pure code, not an LLM."""

    def __init__(self, db):
        self.tools = PlannerTools(db)

    async def plan(self, plan_id):
        context = await self.tools.planning_inputs(plan_id)
        locations = context["locations"]
        unavailable = set(context["request"]["unavailable_trucks"])
        trucks = [
            PlanTruck(
                id=t["id"],
                name=t["name"],
                capacity=t["capacity_gallons"],
                base_id=t["base_plant_id"],
                base_name=locations[t["base_plant_id"]]["name"],
                base_lat=locations[t["base_plant_id"]]["lat"],
                base_lng=locations[t["base_plant_id"]]["lng"],
                shift_start=t["shift_start"],
                shift_end=t["shift_end"],
                flow_gpm=t["discharge_flow_rate_gpm"],
                refill_minutes=t["refill_time_minutes"],
                setup_minutes=t["setup_and_coupling_time_minutes"],
                km_per_gallon=t["fuel_consumption_km_per_gal"],
            )
            for t in context["fleet"]
            if t["id"] not in unavailable and t["status"] == "disponible"
        ]
        by_community: dict[str, list[dict]] = {}
        for incident in context["incidents"]:
            by_community.setdefault(incident["community_id"], []).append(incident)
        demands, skipped = [], []
        for community_id, incidents in sorted(by_community.items()):
            needs_water = [i for i in incidents if i["kind"] != "LEAK"]
            location = locations.get(community_id)
            if not needs_water:
                reason = "FUGA_REQUIERE_REPARACION"
            elif location is None:
                reason = "SIN_UBICACION"
            elif not location.get("estimated_daily_demand_gallons"):
                reason = "SIN_DEMANDA_ESTIMADA"
            else:
                demands.append(
                    PlanDemand(
                        community_id=community_id,
                        name=location["name"],
                        incident_ids=[i["id"] for i in needs_water],
                        score=max(i["score"] for i in needs_water),
                        critical=is_critical_location(location),
                        lat=location["lat"],
                        lng=location["lng"],
                        gallons=location["estimated_daily_demand_gallons"],
                        max_truck_capacity=location["road_access"]["max_tanker_capacity_gallons"],
                    )
                )
                continue
            skipped.append(
                UnservedDemand(
                    community_id=community_id,
                    name=incidents[0]["community_name"],
                    incident_ids=[i["id"] for i in incidents],
                    reason=reason,
                    gallons_missing=None,
                    detail=SKIP_DETAIL[reason],
                )
            )
        result = plan_distribution(demands, trucks)
        result.unserved.extend(skipped)
        if unavailable:
            result.explanation.append(
                "Cisternas excluidas por el coordinador: " + ", ".join(sorted(unavailable)) + "."
            )
        return await self.tools.save_plan(plan_id, result)
