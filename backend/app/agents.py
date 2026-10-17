from uuid import UUID

from app.contracts import (
    DuplicateEvaluationSchema,
    NormalizedReportSchema,
    PlanDemand,
    PlanTruck,
    PriorityInputs,
    UnservedDemand,
    plain,
)
from app.domain import (
    DURATION_BOUNDS,
    calculate_priority,
    explain_priority,
    is_critical_location,
    resolve_criticality,
)
from app.grounding import critical_evidence, extract_temporal_grounding
from app.impact import Demand, compare
from app.planner import plan_distribution
from app.providers import ProviderError
from app.tools import AgentTools, CommunicationTools, PlannerTools


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
        normalized.flags = ["INFORMACION_INSUFICIENTE"] if normalized.kind == "UNKNOWN" else []
        # This field belongs to the citizen, never to model inference.
        normalized.duration_bucket = report["duration_bucket"]
        temporal = extract_temporal_grounding(report["description"])
        observed = temporal.hours
        if temporal.is_imprecise:
            normalized.hours_without_water = None
            normalized.flags.append("DURACION_IMPRECISA")
        if (
            normalized.hours_without_water is not None
            and normalized.hours_without_water not in observed
        ):
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
        elif len(observed) == 1 and normalized.duration_bucket is None:
            normalized.hours_without_water = observed[0]
        if normalized.duration_bucket is not None:
            low, high = DURATION_BOUNDS[normalized.duration_bucket]
            if any(not low <= h < high or h == 0 for h in observed):
                normalized.flags.append("CONTRADICCION_DURACION")
                normalized.duration_bucket = None
            normalized.hours_without_water = None
        if any(h > 2160 for h in observed):
            normalized.flags.append("DURACION_FUERA_DE_RANGO")
            normalized.hours_without_water = None
            normalized.duration_bucket = None
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
        if not candidates:
            # Nothing compatible to match: a model call could only cost time or invent a UUID.
            assessment = DuplicateEvaluationSchema(
                match_confidence="LOW",
                reasoning="Regla determinística: sin incidentes del mismo tipo en sector y ventana",
            )
        elif len(exact) == 1:
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
            duration_bucket=normalized.duration_bucket,
        )
        priority.inputs = PriorityInputs(
            community_id=context["community_id"],
            hours_without_water=normalized.hours_without_water,
            duration_bucket=normalized.duration_bucket,
            duration_source=(
                "CONFLICT"
                if "CONTRADICCION_DURACION" in normalized.flags
                else "CITIZEN"
                if context["hours_without_water"] is not None
                or normalized.duration_bucket is not None
                else "TEXT"
                if normalized.hours_without_water is not None
                else "UNKNOWN"
            ),
            critical_institution=effective_critical,
            population=context["population"],
            vulnerability=context["vulnerability"],
            is_synthetic=context["is_synthetic"],
        )
        priority.flags.extend(normalized.flags)
        priority.flags.extend(crit_flags)
        if context["is_synthetic"]:
            priority.flags.append("DATOS_SECTOR_SINTETICOS")
        if state["association_status"] == "PENDING_REVIEW":
            priority.flags.append("ASOCIACION_TENTATIVA")
        return {
            "priority": await self.tools.save_proposal(key, priority, explain_priority(priority))
        }


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
        community_water_incidents: dict[str, list[dict]] = {}
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
                community_water_incidents[community_id] = needs_water
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

        # Baseline impact evaluation using the same demands and fleet inputs
        community_first_seen: dict[str, str] = {}
        community_report_counts: dict[str, int] = {}
        for cid, inc_list in community_water_incidents.items():
            community_report_counts[cid] = sum(i.get("report_count", 1) for i in inc_list)
            first_times = [
                str(i["first_report_at"]) for i in inc_list if i.get("first_report_at") is not None
            ]
            if not first_times:
                first_times = [
                    str(i["created_at"]) for i in inc_list if i.get("created_at") is not None
                ]
            community_first_seen[cid] = min(first_times) if first_times else str(cid)

        sorted_by_arrival = sorted(
            community_first_seen.keys(),
            key=lambda cid: (community_first_seen[cid], cid),
        )
        arrival_ranks = {cid: rank + 1 for rank, cid in enumerate(sorted_by_arrival)}

        impact_demands = [
            Demand(
                plan=d,
                reports=community_report_counts.get(d.community_id, 1),
                first_report=arrival_ranks.get(d.community_id, 1),
            )
            for d in demands
        ]
        impact_metrics = compare(impact_demands, trucks) if impact_demands else None

        result = plan_distribution(demands, trucks)
        result.unserved.extend(skipped)
        result.impact = impact_metrics
        if unavailable:
            result.explanation.append(
                "Cisternas excluidas por el coordinador: " + ", ".join(sorted(unavailable)) + "."
            )
        return await self.tools.save_plan(plan_id, result)


class CommunicationAgent:
    """Deterministic communication dispatch; pure templates in plain language, no LLM."""

    def __init__(self, db):
        self.tools = CommunicationTools(db)

    async def generate_notifications(self, plan_id: str) -> list[dict]:
        context = await self.tools.plan_context(plan_id)
        if not context or not context["plan"].get("result"):
            return []

        plan_result = context["plan"]["result"]
        locations = context["locations"]

        # 1. Agrupar paradas por comunidad para evitar colisiones con UniqueConstraint
        community_stops: dict[str, list[dict]] = {}
        for route in plan_result.get("routes", []):
            for stop in route.get("stops", []):
                community_stops.setdefault(stop["community_id"], []).append(stop)

        notifications = []
        served_community_ids = set()

        for community_id, stops in sorted(community_stops.items()):
            served_community_ids.add(community_id)
            loc = locations.get(community_id)
            name = loc["name"] if loc else stops[0]["name"]

            # Hora más temprana y galones acumulados
            earliest_arrival = min(s["arrival"] for s in stops)
            total_gallons = sum(s["gallons"] for s in stops)
            all_incident_ids = sorted({inc_id for s in stops for inc_id in s["incident_ids"]})

            text = (
                f"HidroAgente informa: Se ha programado la entrega de agua por camión cisterna "
                f"en tu comunidad ({name}). Primera entrega estimada: {earliest_arrival}. "
                f"Volumen programado: {total_gallons:,} galones. "
                f"Por favor mantén recipientes limpios listos."
            )
            notifications.append(
                {
                    "community_id": community_id,
                    "incident_ids": all_incident_ids,
                    "kind": "SCHEDULED",
                    "text": text,
                    "arrival": earliest_arrival,
                }
            )

        # 2. Comunidades no atendidas (solo si NO tuvieron ninguna parada programada)
        for item in plan_result.get("unserved", []):
            comm_id = item["community_id"]
            if comm_id in served_community_ids:
                continue
            served_community_ids.add(comm_id)
            loc = locations.get(comm_id)
            name = loc["name"] if loc else item["name"]
            reason_detail = item.get("detail", "Demanda no factible en este turno de distribución.")

            text = (
                f"HidroAgente informa: Tu reporte en {name} ha sido procesado. "
                f"En esta ronda no fue posible programar cisterna: {reason_detail} "
                f"Los equipos continúan trabajando para atender la contingencia."
            )
            notifications.append(
                {
                    "community_id": comm_id,
                    "incident_ids": sorted(set(item["incident_ids"])),
                    "kind": "UNSERVED",
                    "text": text,
                    "arrival": None,
                }
            )

        return await self.tools.save_notifications(plan_id, notifications)
