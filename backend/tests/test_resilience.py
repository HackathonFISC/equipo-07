import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.agents import Agents
from app.config import Settings
from app.contracts import DuplicateEvaluationSchema
from app.db import checkpoints
from app.graph import build_graph
from app.models import Association, Execution, Incident, Proposal, Report
from app.providers import MockLLMProvider, ProviderError
from app.services import apply_decision
from app.worker import process_one, recover, worker_lock
from tests.conftest import AUTH
from tests.test_evaluations import BASE, details, review, submit


async def test_replay_side_effects_are_idempotent(system):
    key, _ = await submit(system)
    agents = Agents(system.db, MockLLMProvider(), system.settings)
    state = {"execution_id": key}
    for step in (agents.ingest, agents.verify, agents.coordinate):
        first = await step(state)
        assert await step(state) == first
        state.update(first)
    async with system.db.sessions() as session:
        for model in (Report, Incident, Association, Proposal):
            assert await session.scalar(select(func.count()).select_from(model)) == 1


async def test_worker_interrupted_then_recovered(system):
    started = asyncio.Event()

    class Slow(MockLLMProvider):
        async def extract_report(self, text):
            started.set()
            await asyncio.Event().wait()

    key, _ = await submit(system)
    async with checkpoints(system.settings) as saver:
        task = asyncio.create_task(
            process_one(system.db, build_graph(system.db, Slow(), system.settings, saver), Slow())
        )
        await asyncio.wait_for(started.wait(), 5)
        assert (await details(system, key))["status"] == "RUNNING"
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    await recover(system.db)
    await system.work()
    assert (await details(system, key))["status"] == "WAITING_APPROVAL"
    assert (await review(system, key, approved_score=60)).status_code == 202
    async with system.db.sessions.begin() as session:
        row = await session.get(Execution, key)
        row.status = "RUNNING"
    await recover(system.db)
    await system.work()
    assert (await details(system, key))["status"] == "APPROVED"


def test_worker_lock_excludes_second_worker(tmp_path):
    path = str(tmp_path / "lock")
    with worker_lock(path):
        with pytest.raises(OSError), worker_lock(path):
            pytest.fail("Second worker acquired lock")
    with worker_lock(path):
        pass


async def test_security_and_conflicts(system):
    key, _ = await submit(system)
    assert (await review(system, key)).status_code == 409
    assert (await system.client.get("/api/admin/incidents")).status_code == 401
    assert (await system.client.get("/api/admin/executions")).status_code == 401
    assert (await system.client.get(f"/api/admin/executions/{key}")).status_code == 401
    public = (await system.client.get(f"/api/executions/{key}")).json()
    assert "description" not in public and "traces" not in public
    conflict = await submit(system, {**BASE, "hours_without_water": 25}, key)
    assert conflict[1].status_code == 409
    too_big = await system.client.post("/api/reports", content="x" * 9000)
    assert too_big.status_code == 413
    await system.work()
    invalid = await system.client.post(
        f"/api/executions/{key}/resume",
        headers=AUTH,
        json={"decision": "CORRECT", "reason": "Prueba inválida"},
    )
    assert invalid.status_code == 422
    # Without a tentative association, an association choice is rejected, not silently ignored.
    stray = await review(system, key, "REJECT", association="NEW")
    assert stray.status_code == 409
    assert (await details(system, key))["review"] is None


async def test_rate_limit_persisted(system):
    for _ in range(30):
        result = await submit(system)
        assert result[1].status_code == 202
    assert (await submit(system))[1].status_code == 429


async def test_concurrent_idempotent_reports(system):
    key = str(uuid4())
    results = await asyncio.gather(*(submit(system, BASE, key) for _ in range(3)))
    assert all(r.status_code == 202 for _, r in results)
    async with system.db.sessions() as session:
        assert await session.scalar(select(func.count()).select_from(Report)) == 1


async def test_competing_reviews_cannot_overwrite(system):
    key, _ = await submit(system)
    await system.work()
    responses = await asyncio.gather(
        review(system, key, approved_score=60), review(system, key, "REJECT")
    )
    assert sorted(r.status_code for r in responses) == [202, 409]
    await system.work()
    assert (await details(system, key))["status"] in ("APPROVED", "REJECTED")


def test_checkpoint_path_cannot_equal_business_db(tmp_path):
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite+aiosqlite:///{tmp_path}/same.sqlite",
        checkpoint_path=str(tmp_path / "same.sqlite"),
    )
    with pytest.raises(ValueError, match="archivos distintos"):
        settings.prepare_paths()


@pytest.mark.parametrize(
    "changes",
    [
        {"community_id": "chorrera-demo"},
        {"description": "Hay una fuga de agua en una tubería rota"},
    ],
)
async def test_tool_revalidates_sector_and_kind_before_write(system, changes):
    original, _ = await submit(system)
    await system.work()
    incident = (await details(system, original))["proposal"]["incident_id"]
    other, _ = await submit(system, {**BASE, **changes})
    agents = Agents(system.db, MockLLMProvider(), system.settings)
    await agents.ingest({"execution_id": other})
    assessment = DuplicateEvaluationSchema(
        match_confidence="HIGH",
        matched_incident_id=incident,
        reasoning="Modelo sugiere candidato incompatible",
    )
    with pytest.raises(ProviderError):
        await agents.tools.consolidate(other, assessment)
    assert await agents.tools.association(other) is None


async def test_model_only_sees_candidates_of_the_same_kind(system):
    # Regression (real NIM, F2-01 #4): the model matched a LOW_PRESSURE report to an OUTAGE
    # incident of the same sector, the tool rejected it and every retry ended in ERROR.
    seen = []

    class Eager(MockLLMProvider):
        async def evaluate_duplicate(self, report, candidates):
            seen.append([c["kind"] for c in candidates])
            if not candidates:
                return await super().evaluate_duplicate(report, candidates)
            return DuplicateEvaluationSchema(
                match_confidence="HIGH",
                matched_incident_id=candidates[0]["id"],
                reasoning="Mismo sector",
            )

    original, _ = await submit(system)
    await system.work()
    outage = (await details(system, original))["proposal"]["incident_id"]
    other, _ = await submit(
        system, {**BASE, "description": "La presión del agua cayó a cero desde hace 24 horas"}
    )
    agents = Agents(system.db, Eager(), system.settings)
    state = {"execution_id": other}
    state.update(await agents.ingest(state))
    assert state["normalized"]["kind"] == "LOW_PRESSURE"
    association = await agents.verify(state)
    assert seen == []
    assert association["incident_id"] != outage


async def test_recover_after_decision_commit_before_final_checkpoint(system):
    from app.contracts import ReviewInput

    key, _ = await submit(system)
    await system.work()
    assert (await review(system, key, approved_score=60)).status_code == 202
    async with system.db.sessions.begin() as session:
        execution = await session.get(Execution, key)
        execution.status = "RUNNING"
    body = ReviewInput(decision="APPROVE", reason="Revisado en demo", approved_score=60)
    await apply_decision(system.db, key, body)
    # Simulate process death after this business commit, before LangGraph's final checkpoint.
    detail = await details(system, key)
    assert detail["status"] == "RUNNING" and detail["review"]["applied_at"]
    await recover(system.db)
    await system.work()
    detail = await details(system, key)
    assert detail["status"] == "APPROVED"
    assert sum(t["event"] == "DECISION_APPLIED" for t in detail["traces"]) == 1
