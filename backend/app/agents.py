from uuid import UUID

from app.contracts import DuplicateEvaluationSchema, NormalizedReportSchema, plain
from app.domain import calculate_priority
from app.providers import ProviderError, critical_evidence, stated_hours
from app.tools import AgentTools


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
        observed = stated_hours(report["description"])
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
        # Snapshot of this report: duplicate volume never contributes to the score.
        priority = calculate_priority(
            normalized.hours_without_water,
            normalized.critical_institution,
            context["vulnerability"],
            context["population"],
        )
        priority.flags.extend(normalized.flags)
        if context["is_synthetic"]:
            priority.flags.append("DATOS_SECTOR_SINTETICOS")
        if state["association_status"] == "PENDING_REVIEW":
            priority.flags.append("ASOCIACION_TENTATIVA")
        result = await self.provider.explain_priority_proposal(
            {"id": state["incident_id"], "kind": normalized.kind}, priority.model_dump()
        )
        return {"priority": await self.tools.save_proposal(key, priority, result.explanation)}
