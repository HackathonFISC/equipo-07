"""Finite, transactional operations available to agents; never exposed as LLM tools."""

from app.contracts import DuplicateEvaluationSchema, NormalizedReportSchema, PriorityResult
from app.models import Association, Community, Incident, Proposal, Report, now
from app.providers import ProviderError
from app.services import candidate_incidents, trace


class AgentTools:
    def __init__(self, db, window_hours):
        self._db, self._window_hours = db, window_hours

    async def report_context(self, key):
        async with self._db.sessions() as session:
            report = await session.get(Report, key)
            community = await session.get(Community, report.community_id)
            return {
                "description": report.description,
                "community_id": report.community_id,
                "hours_without_water": report.hours_without_water,
                "normalized": report.normalized,
                "population": community.population,
                "vulnerability": community.vulnerability,
                "is_synthetic": community.is_synthetic,
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
