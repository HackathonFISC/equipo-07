import hashlib
import json
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.domain import calculate_priority
from app.models import Association, Community, Incident, Report, now
from app.providers import MockLLMProvider
from tests.test_evaluations import approved, decide, details, planned, review, submit

INTEGRITY_CASES = [
    c
    for c in json.loads((Path(__file__).parents[2] / "evals/cases.json").read_text("utf-8"))
    if c.get("suite") == "integrity"
]


@pytest.mark.parametrize("case", INTEGRITY_CASES, ids=[c["id"] for c in INTEGRITY_CASES])
async def test_integrity_evaluation(system, case):
    if case["scenario"] == "duration_bucket":
        await check_duration_bucket(system, case["bucket"], case["points"])
    elif case["scenario"] == "text_interval":
        await check_text_interval(system, case["text"])
    elif case["scenario"] == "raw_explanation":
        await check_explanation(system)
    elif case["scenario"] == "null_extraction":
        await check_null_extraction(system)
    else:
        raise AssertionError(f"Escenario no implementado: {case['scenario']}")


async def check_explanation(system):
    async with system.db.sessions.begin() as session:
        community = await session.get(Community, "arraijan-demo")
        community.population = 2630
        community.vulnerability = None

    class Misleading(MockLLMProvider):
        async def explain_priority_proposal(self, incident, priority):
            pytest.fail("An LLM must not reinterpret priority factors")

    key, _ = await submit(
        system,
        {
            "community_id": "arraijan-demo",
            "description": "Estamos sin agua en el sector",
            "hours_without_water": 6,
        },
    )
    await system.work(Misleading())
    detail = await details(system, key)
    assert detail["status"] == "WAITING_APPROVAL"
    proposal = detail["proposal"]
    priority = proposal["priority"]
    assert (priority["score_min"], priority["score_max"]) == (17, 67)
    assert priority["factors"]["hours"] == [9, 9]
    assert priority["factors"]["population"] == [8, 8]
    assert priority["inputs"]["population"] == 2630
    explanation = proposal["explanation"]
    assert "2630 habitantes" in explanation and "8 puntos" in explanation
    assert "no confirmada" in explanation
    assert "0–30 puntos" in explanation
    assert "9 horas" not in explanation and "%" not in explanation and "moderada" not in explanation
    assert detail["report"]["hours_without_water"] == 6


async def check_duration_bucket(system, bucket, points):
    key, response = await submit(
        system,
        {
            "community_id": "arraijan-demo",
            "description": "Estamos sin agua en el sector",
            "duration_bucket": bucket,
        },
    )
    assert response.status_code == 202
    await system.work()
    detail = await details(system, key)
    assert detail["status"] == "WAITING_APPROVAL"
    assert detail["report"]["duration_bucket"] == bucket
    assert detail["report"]["hours_without_water"] is None
    priority = detail["proposal"]["priority"]
    assert priority["inputs"]["duration_bucket"] == bucket
    assert priority["inputs"]["hours_without_water"] is None
    assert priority["factors"]["hours"] == [points, points]
    snapshot = priority["inputs"]
    reproduced = calculate_priority(
        snapshot["hours_without_water"],
        snapshot["critical_institution"],
        snapshot["vulnerability"],
        snapshot["population"],
        duration_bucket=snapshot["duration_bucket"],
    ).model_dump()
    for field in ("score_min", "score_max", "factors"):
        assert reproduced[field] == priority[field]


async def check_text_interval(system, text):
    key, _ = await submit(system, {"community_id": "arraijan-demo", "description": text})
    await system.work()
    detail = await details(system, key)
    assert detail["status"] == "WAITING_APPROVAL"
    priority = detail["proposal"]["priority"]
    assert priority["factors"]["hours"] == [0, 35]
    assert "DURACION_IMPRECISA" in priority["flags"]


async def check_null_extraction(system):
    class Incomplete(MockLLMProvider):
        async def extract_report(self, text):
            result = await super().extract_report(text)
            result.hours_without_water = None
            return result

    key, _ = await submit(
        system,
        {
            "community_id": "arraijan-demo",
            "description": "Estamos sin agua desde hace 24 horas",
        },
    )
    await system.work(Incomplete())
    detail = await details(system, key)
    assert detail["proposal"]["priority"]["factors"]["hours"] == [26, 26]


async def test_duplicate_approval_preserves_scheduled_incident(system):
    text = "El hospital está sin agua desde hace 24 horas"
    incident_id = await approved(system, "crit-hosp-nicolas-solano", text)
    plan = await planned(system)
    assert (await decide(system, plan)).status_code == 200
    key, _ = await submit(system, {"community_id": "crit-hosp-nicolas-solano", "description": text})
    await system.work()
    detail = await details(system, key)
    assert detail["proposal"]["incident_id"] == incident_id
    p = detail["proposal"]["priority"]
    assert (await review(system, key, approved_score=p["score_min"])).status_code == 202
    await system.work()
    async with system.db.sessions() as session:
        assert (await session.get(Incident, incident_id)).status == "SCHEDULED"


async def test_new_interval_contract_preserves_legacy_idempotency_keys(system):
    body = {
        "community_id": "arraijan-demo",
        "description": "Sin agua en el sector",
        "hours_without_water": 6.0,
    }
    key, _ = await submit(system, body)
    # Exact serialization used before duration_bucket existed (Pydantic compact JSON).
    digest = hashlib.sha256(
        json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    async with system.db.sessions.begin() as session:
        report = await session.get(Report, key)
        report.payload_hash = digest
    assert (await submit(system, body, key))[1].status_code == 202
    assert (await submit(system, {**body, "hours_without_water": 18}, key))[1].status_code == 409


async def test_snapshot_stays_reproducible_after_catalog_change_and_replay(system):
    key, _ = await submit(system)
    await system.work()
    before = (await details(system, key))["proposal"]
    async with system.db.sessions.begin() as session:
        community = await session.get(Community, "arraijan-demo")
        community.population = 99999
        community.vulnerability = 1
    from app.agents import Agents

    agents = Agents(system.db, MockLLMProvider(), system.settings)
    assert (await agents.coordinate({"execution_id": key}))["priority"] == before["priority"]
    after = (await details(system, key))["proposal"]
    assert before == after


async def test_same_kind_and_community_are_tentative_and_old_incidents_are_excluded(system):
    first, _ = await submit(
        system,
        {
            "community_id": "arraijan-demo",
            "description": "Sin agua en calle norte desde hace 12 horas",
        },
    )
    await system.work()
    old_id = (await details(system, first))["proposal"]["incident_id"]
    second, _ = await submit(
        system,
        {
            "community_id": "arraijan-demo",
            "description": "Sin agua en calle sur desde hace 48 horas",
        },
    )
    await system.work()
    tentative = await details(system, second)
    assert tentative["association"]["status"] == "PENDING_REVIEW"
    assert (await review(system, second, "REJECT")).status_code == 202
    await system.work()
    async with system.db.sessions.begin() as session:
        incident = await session.get(Incident, old_id)
        incident.last_activity = now() - timedelta(hours=73)
    third, _ = await submit(
        system,
        {
            "community_id": "arraijan-demo",
            "description": "Sin agua en calle norte desde hace 12 horas",
        },
    )
    await system.work()
    assert (await details(system, third))["proposal"]["incident_id"] != old_id
    async with system.db.sessions() as session:
        assert len((await session.scalars(select(Association))).all()) == 3


async def test_report_detail_is_admin_only_and_available_before_association(system):
    key, _ = await submit(system)
    assert (await system.client.get(f"/api/admin/executions/{key}")).status_code == 401
    assert (await details(system, key))["report"]["hours_without_water"] == 24
    public = (await system.client.get(f"/api/executions/{key}")).json()
    assert "report" not in public and "description" not in public
    schema = (await system.client.get("/openapi.json")).json()
    assert "duration_bucket" in schema["components"]["schemas"]["ReportInput"]["properties"]


async def test_duration_fields_are_exclusive_and_invalid_buckets_are_rejected(system):
    body = {"community_id": "arraijan-demo", "description": "Sin agua en el sector"}
    for extra in (
        {"duration_bucket": "OTHER"},
        {"duration_bucket": "LT_12H", "hours_without_water": 6},
    ):
        assert (await submit(system, {**body, **extra}))[1].status_code == 422
    # Both omitted means unknown; it never means zero.
    key, _ = await submit(system, body)
    await system.work()
    assert (await details(system, key))["proposal"]["priority"]["factors"]["hours"] == [0, 35]


@pytest.mark.parametrize(
    "text,points,conflict",
    [
        ("Sin agua desde hace 18 horas", [18, 18], False),
        ("Sin agua desde hace 48 horas", [0, 35], True),
    ],
)
async def test_interval_and_text_are_compared_without_fabricating_hours(
    system, text, points, conflict
):
    key, _ = await submit(
        system, {"community_id": "arraijan-demo", "description": text, "duration_bucket": "H12_24"}
    )
    await system.work()
    p = (await details(system, key))["proposal"]["priority"]
    assert p["factors"]["hours"] == points
    assert p["inputs"]["hours_without_water"] is None
    assert ("CONTRADICCION_DURACION" in p["flags"]) == conflict


async def test_verification_failure_retries_from_checkpoint_without_duplicate_effects(system):
    from app.providers import ProviderError
    from tests.conftest import AUTH

    await submit(system)
    await system.work()

    class Failing(MockLLMProvider):
        async def evaluate_duplicate(self, report, candidates):
            raise ProviderError("controlled failure")

    key, _ = await submit(
        system,
        {"community_id": "arraijan-demo", "description": "No llega el agua desde hace 24 horas"},
    )
    await system.work(Failing())
    failed = await details(system, key)
    assert failed["status"] == "ERROR" and failed["association"] is None
    assert failed["report"]["normalized"]["hours_without_water"] == 24
    assert any(t["agent"] == "verification" and t["event"] == "ERROR" for t in failed["traces"])

    class Retrying(MockLLMProvider):
        async def extract_report(self, text):
            pytest.fail("Retry should use the saved ingestion checkpoint")

    assert (
        await system.client.post(f"/api/executions/{key}/retry", headers=AUTH)
    ).status_code == 202
    await system.work(Retrying())
    recovered = await details(system, key)
    assert recovered["status"] == "WAITING_APPROVAL" and recovered["attempts"] == 2
    assert sum(t["event"] == "NORMALIZED" for t in recovered["traces"]) == 1
    assert sum(t["event"] == "CONSOLIDATED" for t in recovered["traces"]) == 1


async def test_candidate_kind_filter_precedes_the_limit(system):
    first, _ = await submit(system)
    await system.work()
    original = (await details(system, first))["proposal"]["incident_id"]
    async with system.db.sessions.begin() as session:
        for _ in range(21):
            session.add(
                Incident(community_id="arraijan-demo", kind="LEAK", summary="Fuga en el sector")
            )
    second, _ = await submit(system)
    await system.work()
    assert (await details(system, second))["proposal"]["incident_id"] == original


async def test_provider_flags_cannot_forge_critical_provenance(system):
    class Forged(MockLLMProvider):
        async def extract_report(self, text):
            result = await super().extract_report(text)
            result.flags = ["CRITICIDAD_TEXTO", "CRITICIDAD_CATALOGO", "human_approved"]
            return result

    key, _ = await submit(system)
    await system.work(Forged())
    p = (await details(system, key))["proposal"]["priority"]
    assert p["factors"]["critical"] == [0, 30]
    assert not {"CRITICIDAD_TEXTO", "CRITICIDAD_CATALOGO", "human_approved"} & set(p["flags"])
