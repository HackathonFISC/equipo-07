"""Adaptador común: guarda mensajes de cualquier canal, conduce el chatbot y usa submit_report."""

import asyncio
import hashlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.integrations import chatbot
from app.integrations.models import InboundDraft, InboundMessage
from app.models import Report, now, uid
from app.services import Missing, log_event, record_dict, submit_report

# MIME admitido por clase de adjunto -> extensión con la que se guarda en disco.
AUDIO = {
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/amr": ".amr",
}
ALLOWED = {
    "image": {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"},
    "audio": AUDIO,
    "voice": AUDIO,
    "document": {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "text/plain": ".txt",
    },
}
DRAFT_WINDOW = timedelta(hours=24)
# The bot submits from the server, so the per-IP limit of the web form never applies to it.
DRAFTS_PER_HOUR = 5
RATE_LIMITED = (
    "Ya iniciaste varios reportes en la última hora. Espera un momento antes de enviar otro; "
    "el equipo de coordinación ya tiene los anteriores."
)


class DownloadError(Exception):
    pass


@dataclass
class Attachment:
    kind: str
    file_id: str  # identificador del proveedor, nunca una URL enviada por el usuario
    mime_type: str
    size: int | None = None


@dataclass
class Inbound:
    channel: str
    external_id: str
    conversation_id: str
    text: str | None
    content_type: str
    attachments: list[Attachment] = field(default_factory=list)


Fetch = Callable[[Attachment, int], Awaitable[bytes]]


async def download(client, url, max_bytes, headers=None) -> bytes:
    async with client.stream("GET", url, headers=headers) as response:
        response.raise_for_status()
        data = bytearray()
        async for chunk in response.aiter_bytes():
            data += chunk
            if len(data) > max_bytes:
                raise DownloadError("TOO_LARGE")
        return bytes(data)


async def save_attachment(settings, message: Inbound, index, attachment: Attachment, fetch: Fetch):
    mime = attachment.mime_type.split(";")[0].strip().lower()
    record = {"kind": attachment.kind, "file_id": attachment.file_id, "mime_type": mime}
    extension = ALLOWED.get(attachment.kind, {}).get(mime)
    if extension is None:
        return {**record, "status": "REJECTED", "error": "UNSUPPORTED_TYPE"}
    if (attachment.size or 0) > settings.media_max_bytes:
        return {**record, "status": "REJECTED", "error": "TOO_LARGE"}
    try:
        data = await fetch(attachment, settings.media_max_bytes)
    except Exception as exc:
        # Download boundary: the message is kept; the provider file id allows a later retry.
        error = str(exc) if isinstance(exc, DownloadError) else type(exc).__name__
        return {**record, "status": "ERROR", "error": error}
    # Hashed name: no user-controlled path segment, and a retried event overwrites the same file.
    digest = hashlib.sha256(message.external_id.encode()).hexdigest()
    name = f"{message.channel}/{digest}-{index}{extension}"
    path = Path(settings.media_path) / name
    await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
    await asyncio.to_thread(path.write_bytes, data)
    return {
        **record,
        "status": "STORED",
        "path": name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


async def active_draft(session, message: Inbound):
    return await session.scalar(
        select(InboundDraft)
        .where(
            InboundDraft.channel == message.channel,
            InboundDraft.conversation_id == message.conversation_id,
            InboundDraft.status == "COLLECTING",
            InboundDraft.updated_at >= now() - DRAFT_WINDOW,
        )
        .order_by(InboundDraft.updated_at.desc())
        .limit(1)
    )


async def recent_drafts(session, message: Inbound) -> int:
    return await session.scalar(
        select(func.count())
        .select_from(InboundDraft)
        .where(
            InboundDraft.channel == message.channel,
            InboundDraft.conversation_id == message.conversation_id,
            InboundDraft.created_at >= now() - timedelta(hours=1),
        )
    )


async def finalize(db, settings, draft_id) -> str:
    """Submits a CONFIRMED draft through submit_report; safe to repeat after a crash."""
    async with db.sessions() as session:
        draft = await session.get(InboundDraft, draft_id)
        if draft.status != "CONFIRMED":
            return draft.status
        # The draft id is the report's Idempotency-Key: a report here means a prior crash.
        submitted = await session.get(Report, draft_id) is not None
    status, missing = "SUBMITTED", []
    if not submitted:
        try:
            await submit_report(db, chatbot.report_input(draft.fields), draft_id, settings)
        except Missing:
            # Catalog not seeded in this database: keep the report for a coordinator.
            status, missing = "PENDING", ["community"]
    async with db.sessions.begin() as session:
        draft = await session.get(InboundDraft, draft_id)
        draft.status, draft.missing = status, missing
        draft.report_id = draft_id if status == "SUBMITTED" else None
    return status


async def ingest(db, settings, message: Inbound, fetch: Fetch) -> list[chatbot.Prompt]:
    """Stores the message, advances the conversation and returns the replies to send.

    Returns only after the message is durable, so callers may acknowledge the provider.
    """
    async with db.sessions() as session:
        existing = await session.scalar(
            select(InboundMessage).where(
                InboundMessage.channel == message.channel,
                InboundMessage.external_id == message.external_id,
            )
        )
        draft = None if existing else await active_draft(session, message)
        linked = (
            await session.get(InboundDraft, existing.draft_id)
            if existing and existing.draft_id
            else None
        )
    if existing:
        # Redelivery after a failed submission: finish it and send the code the citizen missed.
        if linked is not None and linked.status == "CONFIRMED":
            status = await finalize(db, settings, existing.draft_id)
            return [chatbot.outcome(status, existing.draft_id)]
        return []
    # Before consent keep only what processing needs: no text and no downloaded files.
    consented = bool(draft and draft.fields.get("consented_at"))
    attachments = [
        await save_attachment(settings, message, index, attachment, fetch)
        for index, attachment in enumerate(message.attachments if consented else [])
    ]
    status = (
        "PRE_CONSENT"
        if not consented
        else "UNSUPPORTED"
        if not message.text and not attachments
        else "ATTACHMENT_ERROR"
        if any(a["status"] != "STORED" for a in attachments)
        else "STORED"
    )
    action, replies = None, []
    try:
        async with db.sessions.begin() as session:
            draft = await active_draft(session, message)
            command = chatbot.command(message.text)
            if draft is not None and command:
                draft.status = "CANCELLED"
            if command == "cancel":
                replies = [chatbot.Prompt(chatbot.CANCELLED)]
            elif (draft is None or command) and await recent_drafts(session, message) >= (
                DRAFTS_PER_HOUR
            ):
                draft, replies = None, [chatbot.Prompt(RATE_LIMITED)]
            elif draft is None or command:
                draft = InboundDraft(
                    id=uid(),
                    channel=message.channel,
                    conversation_id=message.conversation_id,
                    status="COLLECTING",
                    fields={"step": "CONSENT"},
                )
                session.add(draft)
                replies = [chatbot.prompt(draft.fields)]
            else:
                fields = dict(draft.fields)
                notes, action = chatbot.advance(fields, message.text, attachments)
                draft.fields, draft.text = fields, fields.get("description")
                draft.missing = ["transcription"] if fields.get("awaiting_transcription") else []
                draft.updated_at = now()
                if action == "cancel":
                    draft.status = "CANCELLED"
                    replies = [chatbot.Prompt(chatbot.CANCELLED)]
                elif action == "confirm":
                    if fields["kind"] in chatbot.SUPPORTED:
                        draft.status = "CONFIRMED"
                    else:
                        draft.status, draft.missing = "PENDING", ["kind"]
                else:
                    replies = [chatbot.prompt(fields, notes)]
            draft_id = draft.id if draft else None
            session.add(
                InboundMessage(
                    channel=message.channel,
                    external_id=message.external_id,
                    conversation_id=message.conversation_id,
                    draft_id=draft_id,
                    text=message.text if consented else None,
                    content_type=message.content_type[:16],
                    attachments=attachments,
                    status=status,
                )
            )
    except IntegrityError:
        return []  # a concurrent delivery of the same event won the insert
    # Never log text, chat ids or phone numbers.
    log_event(
        event="inbound_message",
        channel=message.channel,
        content_type=message.content_type,
        status=status,
    )
    if action == "confirm":
        replies = [chatbot.outcome(await finalize(db, settings, draft_id), draft_id)]
    return replies


admin = APIRouter()


@admin.get("/api/admin/inbound")
async def inbound_messages(
    request: Request, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)
):
    async with request.app.state.db.sessions() as session:
        rows = await session.execute(
            select(InboundMessage, InboundDraft)
            .outerjoin(InboundDraft, InboundMessage.draft_id == InboundDraft.id)
            .order_by(InboundMessage.received_at.desc(), InboundMessage.id)
            .offset(offset)
            .limit(limit)
        )
        return [
            {**record_dict(message), "draft": record_dict(draft) if draft else None}
            for message, draft in rows
        ]
