from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(UTC).replace(tzinfo=None)


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Community(Base):
    __tablename__ = "communities"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(80))
    population: Mapped[int | None]
    vulnerability: Mapped[float | None]
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (
        CheckConstraint("population IS NULL OR population >= 0"),
        CheckConstraint("vulnerability IS NULL OR vulnerability BETWEEN 0 AND 1"),
    )


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    community_id: Mapped[str] = mapped_column(ForeignKey("communities.id"))
    description: Mapped[str] = mapped_column(String(2000))
    hours_without_water: Mapped[float | None] = mapped_column(Float)
    duration_bucket: Mapped[str | None] = mapped_column(String(8))
    payload_hash: Mapped[str] = mapped_column(String(64))
    normalized: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (
        CheckConstraint("hours_without_water IS NULL OR hours_without_water BETWEEN 0 AND 2160"),
    )


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    community_id: Mapped[str] = mapped_column(ForeignKey("communities.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    summary: Mapped[str] = mapped_column(String(2000))
    status: Mapped[str] = mapped_column(String(24), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    last_activity: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class Association(Base):
    __tablename__ = "associations"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    status: Mapped[str] = mapped_column(String(24))
    reasoning: Mapped[str] = mapped_column(String(600))
    confidence: Mapped[str] = mapped_column(String(8))


class Execution(Base):
    __tablename__ = "executions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", index=True)
    provider: Mapped[str] = mapped_column(String(100))
    is_simulated: Mapped[bool]
    error: Mapped[str | None] = mapped_column(String(120))
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Proposal(Base):
    __tablename__ = "proposals"
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"))
    priority: Mapped[dict] = mapped_column(JSON)
    explanation: Mapped[str] = mapped_column(String(1200))
    final_score: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("final_score IS NULL OR final_score BETWEEN 0 AND 100"),)


class Review(Base):
    __tablename__ = "reviews"
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    actor: Mapped[str] = mapped_column(String(40), default="coordinator-shared-token")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime)


class Trace(Base):
    __tablename__ = "traces"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), index=True)
    category: Mapped[str] = mapped_column(String(16))
    agent: Mapped[str] = mapped_column(String(40))
    tool: Mapped[str | None] = mapped_column(String(40))
    event: Mapped[str] = mapped_column(String(40))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class RateLimit(Base):
    __tablename__ = "rate_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window: Mapped[int] = mapped_column(Integer, index=True)
    count: Mapped[int] = mapped_column(Integer)


class DistributionPlan(Base):
    __tablename__ = "distribution_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    status: Mapped[str] = mapped_column(String(24), default="QUEUED", index=True)
    request: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON)
    review: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(String(120))
    events: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    plan_id: Mapped[str] = mapped_column(ForeignKey("distribution_plans.id"), index=True)
    community_id: Mapped[str] = mapped_column(ForeignKey("communities.id"), index=True)
    incident_ids: Mapped[list] = mapped_column(JSON)
    kind: Mapped[str] = mapped_column(String(24))
    text: Mapped[str] = mapped_column(String(1000))
    arrival: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(16), default="READY")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (
        UniqueConstraint("plan_id", "community_id", name="uq_notifications_plan_community"),
    )
