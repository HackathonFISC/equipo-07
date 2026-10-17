import asyncio
import os
from contextlib import contextmanager

from langgraph.types import Command
from sqlalchemy import select, update

from app.agents import PlannerAgent
from app.config import Settings
from app.db import Database, checkpoints
from app.graph import build_graph
from app.models import DistributionPlan, Execution, Review
from app.providers import make_provider
from app.services import log_event, plan_event, trace


@contextmanager
def worker_lock(path):
    """OS releases the lock on process death, including forced termination."""
    with open(path, "a+b") as file:
        file.seek(0)
        if os.name == "nt":
            import msvcrt

            if not file.read(1):
                file.write(b"0")
                file.flush()
            file.seek(0)
            msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                file.seek(0)
                msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(file.fileno(), fcntl.LOCK_UN)


async def recover(db):
    # Only called while holding the process lock; no live job can be stolen.
    async with db.sessions.begin() as session:
        await session.execute(
            update(Execution).where(Execution.status == "RUNNING").values(status="QUEUED")
        )
        await session.execute(
            update(DistributionPlan)
            .where(DistributionPlan.status == "RUNNING")
            .values(status="QUEUED")
        )


async def process_one(db, graph, provider):
    async with db.sessions.begin() as session:
        execution = await session.scalar(
            select(Execution)
            .where(Execution.status.in_(["QUEUED", "RESUME_QUEUED"]))
            .order_by(Execution.created_at, Execution.id)
            .limit(1)
        )
        if execution is None:
            return False
        key = execution.id
        execution.status = "RUNNING"
        execution.attempts += 1
        trace(session, key, "worker", "START", attempt=execution.attempts)
        review = await session.get(Review, key)
        review_payload = review.payload if review else None
    config = {"configurable": {"thread_id": key}}
    try:
        if execution.provider != provider.name or execution.is_simulated != provider.is_simulated:
            raise ValueError("PROVIDER_CONFIGURATION_CHANGED")
        snapshot = await graph.aget_state(config)
        if not snapshot.values:
            await graph.ainvoke({"execution_id": key}, config)
        elif snapshot.next:
            interrupted = any(task.interrupts for task in snapshot.tasks)
            if interrupted and review_payload is not None:
                await graph.ainvoke(Command(resume=review_payload), config)
            elif not interrupted:
                await graph.ainvoke(None, config)
        snapshot = await graph.aget_state(config)
        status = "WAITING_APPROVAL" if snapshot.next else snapshot.values["terminal"]
        async with db.sessions.begin() as session:
            row = await session.get(Execution, key)
            row.status, row.error = status, None
            trace(session, key, "worker", "END", status=status)
        log_event(execution_id=key, event="execution", status=status)
    except Exception as exc:
        # Job boundary: persist failure, keep the worker alive, never silently use a mock.
        error = type(exc).__name__
        async with db.sessions.begin() as session:
            row = await session.get(Execution, key)
            row.status, row.error = "ERROR", error
            trace(session, key, "worker", "ERROR", error=error)
        log_event(execution_id=key, event="execution", status="ERROR", error=error)
    return True


async def process_plan(db, planner):
    async with db.sessions.begin() as session:
        plan = await session.scalar(
            select(DistributionPlan)
            .where(DistributionPlan.status == "QUEUED")
            .order_by(DistributionPlan.created_at, DistributionPlan.id)
            .limit(1)
        )
        if plan is None:
            return False
        key = plan.id
        plan.status = "RUNNING"
        plan_event(plan, "worker", "START")
    try:
        await planner.plan(key)
        status, error = "PROPOSED", None
    except Exception as exc:
        # Job boundary: a failed plan is visible to the coordinator, never replaced by a guess.
        status, error = "ERROR", type(exc).__name__
    async with db.sessions.begin() as session:
        plan = await session.get(DistributionPlan, key)
        plan.status, plan.error = status, error
        plan_event(plan, "worker", "END", status=status, error=error)
    log_event(plan_id=key, event="plan", status=status, error=error)
    return True


async def run():
    settings = Settings()
    db = Database(settings)
    provider = make_provider(settings)
    # shortcut: one local worker serializes incident writes; use leases before multi-host workers.
    try:
        with worker_lock(settings.checkpoint_path + ".worker.lock"):
            await recover(db)
            async with checkpoints(settings) as saver:
                graph = build_graph(db, provider, settings, saver)
                planner = PlannerAgent(db)
                log_event(event="worker_started", provider=provider.name)
                while True:
                    if not await process_one(db, graph, provider) and not await process_plan(
                        db, planner
                    ):
                        await asyncio.sleep(0.5)
    finally:
        await db.engine.dispose()
        if hasattr(provider, "client"):
            await provider.client.close()


if __name__ == "__main__":
    asyncio.run(run())
