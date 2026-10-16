import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.config import Settings
from app.contracts import ExecutionReceipt, ReportInput, ReviewInput
from app.db import Database
from app.models import Community, Execution, Incident
from app.services import (
    Conflict,
    Missing,
    enqueue_review,
    execution_detail,
    rate_limit,
    record_dict,
    retry_execution,
    submit_report,
)


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    db = Database(settings)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await db.engine.dispose()

    app = FastAPI(title="AguaIA", version="0.1.0", lifespan=lifespan)
    app.state.db = db
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Coordinator-Token", "Idempotency-Key"],
    )

    @app.middleware("http")
    async def body_limit(request: Request, call_next):
        if request.method == "POST":
            size = 0
            chunks = []
            async for chunk in request.stream():
                size += len(chunk)
                if size > 8192:
                    return JSONResponse({"detail": "Cuerpo demasiado grande"}, status_code=413)
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(Conflict)
    async def conflict_handler(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(Missing)
    async def missing_handler(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    async def coordinator(x_coordinator_token: Annotated[str | None, Header()] = None):
        expected = settings.coordinator_token.get_secret_value()
        if len(expected) < 16:
            raise HTTPException(503, "Configura COORDINATOR_TOKEN con al menos 16 caracteres")
        if not secrets.compare_digest((x_coordinator_token or "").encode(), expected.encode()):
            raise HTTPException(401, "Token de coordinación inválido")

    protected = [Depends(coordinator)]

    def receipt(execution):
        return {
            "report_id": execution.report_id,
            "thread_id": execution.id,
            "status": execution.status,
            "is_simulated": execution.is_simulated,
        }

    @app.get("/api/health")
    async def health():
        async with db.sessions() as session:
            await session.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "provider": settings.llm_provider,
            "is_simulated": settings.llm_provider == "mock",
        }

    @app.get("/api/communities")
    async def communities():
        async with db.sessions() as session:
            return [
                record_dict(c)
                for c in (await session.scalars(select(Community).order_by(Community.name))).all()
            ]

    @app.post("/api/reports", status_code=202, response_model=ExecutionReceipt)
    async def reports(
        body: ReportInput, request: Request, idempotency_key: Annotated[UUID, Header()]
    ):
        if not await rate_limit(
            db, request.client.host if request.client else "unknown", settings.rate_limit_per_minute
        ):
            raise HTTPException(
                429, "Demasiados reportes; intenta en un minuto", headers={"Retry-After": "60"}
            )
        try:
            execution = await submit_report(db, body, str(idempotency_key), settings)
        except IntegrityError:
            execution = await submit_report(db, body, str(idempotency_key), settings)
        return receipt(execution)

    @app.get("/api/executions/{thread_id}", response_model=ExecutionReceipt)
    async def status(thread_id: UUID):
        async with db.sessions() as session:
            execution = await session.get(Execution, str(thread_id))
            if not execution:
                raise Missing("Ejecución no encontrada")
            return receipt(execution)

    @app.get("/api/admin/executions", dependencies=protected)
    async def executions(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
        async with db.sessions() as session:
            return [
                record_dict(e)
                for e in (
                    await session.scalars(
                        select(Execution)
                        .order_by(Execution.created_at.desc(), Execution.id)
                        .offset(offset)
                        .limit(limit)
                    )
                ).all()
            ]

    @app.get("/api/admin/incidents", dependencies=protected)
    async def incidents(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
        async with db.sessions() as session:
            return [
                record_dict(i)
                for i in (
                    await session.scalars(
                        select(Incident)
                        .order_by(Incident.last_activity.desc(), Incident.id)
                        .offset(offset)
                        .limit(limit)
                    )
                ).all()
            ]

    @app.get("/api/admin/executions/{thread_id}", dependencies=protected)
    async def detail(thread_id: UUID):
        return await execution_detail(db, str(thread_id))

    @app.post(
        "/api/executions/{thread_id}/resume",
        dependencies=protected,
        status_code=202,
        response_model=ExecutionReceipt,
    )
    async def resume(thread_id: UUID, body: ReviewInput):
        try:
            execution = await enqueue_review(db, str(thread_id), body)
        except IntegrityError:
            execution = await enqueue_review(db, str(thread_id), body)
        return receipt(execution)

    @app.post("/api/executions/{thread_id}/retry", dependencies=protected, status_code=202)
    async def retry(thread_id: UUID):
        await retry_execution(db, str(thread_id))
        return {"thread_id": str(thread_id), "status": "QUEUED"}

    return app


app = create_app()
