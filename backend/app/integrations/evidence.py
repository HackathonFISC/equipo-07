"""Advisory analysis of citizen photos: a short description and whether it relates to water.

Runs in the worker, never in the chat loop (a vision call takes ~10 s). The result is shown to
the coordinator next to the report; it never changes the kind, the hours or the score.
"""

import asyncio
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from app.integrations.models import InboundMessage
from app.models import now
from app.services import log_event

WINDOW = timedelta(days=7)


def pending(message: InboundMessage) -> int | None:
    for index, attachment in enumerate(message.attachments or []):
        if (
            attachment.get("status") == "STORED"
            and attachment.get("mime_type", "").startswith("image/")
            and "analysis" not in attachment
        ):
            return index
    return None


async def analyze_next_image(db, settings, provider) -> bool:
    """Analyzes one stored photo; returns False when there is nothing to do."""
    async with db.sessions() as session:
        messages = (
            await session.scalars(
                select(InboundMessage)
                .where(
                    InboundMessage.content_type.in_(("image", "document")),
                    InboundMessage.received_at >= now() - WINDOW,
                )
                .order_by(InboundMessage.received_at, InboundMessage.id)
            )
        ).all()
    target = next(((m, i) for m in messages if (i := pending(m)) is not None), None)
    if target is None:
        return False
    message, index = target
    attachment = message.attachments[index]
    try:
        data = await asyncio.to_thread((Path(settings.media_path) / attachment["path"]).read_bytes)
        result = await provider.describe_image(data, attachment["mime_type"])
        analysis = {
            "status": "DONE",
            **result.model_dump(),
            "model": getattr(provider, "vision_model", provider.name),
            "simulated": provider.is_simulated,
        }
    except Exception as exc:
        # Recorded, not retried forever: the coordinator still has the photo itself.
        analysis = {"status": "ERROR", "error": type(exc).__name__}
    async with db.sessions.begin() as session:
        row = await session.get(InboundMessage, message.id)
        attachments = [dict(item) for item in row.attachments]
        attachments[index] = {**attachments[index], "analysis": analysis}
        row.attachments = attachments
    log_event(event="image_evidence", status=analysis["status"])
    return True
