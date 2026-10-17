from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, now, uid


class InboundDraft(Base):
    """Reporte en conversación; su id es el Idempotency-Key del reporte que llegue a crear."""

    __tablename__ = "inbound_drafts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    channel: Mapped[str] = mapped_column(String(16))
    conversation_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)
    text: Mapped[str | None] = mapped_column(String(8000))
    missing: Mapped[list] = mapped_column(JSON, default=list)
    # Conversation step and the structured answers collected by the chatbot.
    fields: Mapped[dict] = mapped_column(JSON, default=dict)
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (
        Index("ix_inbound_drafts_conversation", "channel", "conversation_id", "updated_at"),
    )


class InboundMessage(Base):
    __tablename__ = "inbound_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    channel: Mapped[str] = mapped_column(String(16))
    external_id: Mapped[str] = mapped_column(String(128))
    conversation_id: Mapped[str] = mapped_column(String(64))
    draft_id: Mapped[str | None] = mapped_column(ForeignKey("inbound_drafts.id"), index=True)
    text: Mapped[str | None] = mapped_column(String(4096))
    content_type: Mapped[str] = mapped_column(String(16))
    attachments: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(24))
    received_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    __table_args__ = (
        UniqueConstraint("channel", "external_id", name="uq_inbound_messages_external"),
    )
