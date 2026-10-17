"""Receptor Telegram por long polling: `uv run python -m app.integrations.telegram`."""

import asyncio
from datetime import timedelta

import httpx
from sqlalchemy import select

from app.config import Settings
from app.db import Database
from app.integrations.chatbot import Prompt
from app.integrations.inbox import Attachment, DownloadError, Inbound, download, ingest
from app.integrations.models import InboundDraft
from app.models import (
    Association,
    Community,
    DistributionPlan,
    Incident,
    Notification,
    Report,
    now,
)
from app.services import log_event

NOTICE_WINDOW = timedelta(days=7)
# A citizen follows the zone of their latest report for this long.
ALERT_WINDOW = timedelta(days=90)
PROBLEMS = {
    "OUTAGE": "falta de agua",
    "LOW_PRESSURE": "baja presión",
    "LEAK": "fuga de agua",
    "UNKNOWN": "un problema con el suministro",
}

# Invalid token, or a webhook / another poller already owns this bot: retrying cannot help.
FATAL = {401, 404, 409}


class TelegramError(Exception):
    def __init__(self, code, description):
        super().__init__(description)
        self.code = code


class Telegram:
    def __init__(self, client: httpx.AsyncClient, token: str):
        self.client, self.token = client, token

    async def call(self, method, **params):
        payload = {key: value for key, value in params.items() if value is not None}
        body = (await self.client.post(f"/bot{self.token}/{method}", json=payload)).json()
        if not body.get("ok"):
            raise TelegramError(body.get("error_code"), body.get("description", ""))
        return body["result"]

    async def fetch(self, attachment: Attachment, max_bytes) -> bytes:
        file = await self.call("getFile", file_id=attachment.file_id)
        if (file.get("file_size") or 0) > max_bytes:
            raise DownloadError("TOO_LARGE")
        return await download(self.client, f"/file/bot{self.token}/{file['file_path']}", max_bytes)

    async def send(self, chat_id, prompt: Prompt):
        labels = [label for _, label in prompt.options]
        rows = range(0, len(labels), 2)
        keyboard = [[{"text": label} for label in labels[i : i + 2]] for i in rows]
        markup = (
            {"keyboard": keyboard, "resize_keyboard": True, "one_time_keyboard": True}
            if keyboard
            else {"remove_keyboard": True}
        )
        await self.call("sendMessage", chat_id=chat_id, text=prompt.numbered(), reply_markup=markup)


def normalize(update) -> Inbound | None:
    message = update.get("message")
    # Only private chats: group members never opened the bot and saw its privacy notice.
    if not message or message.get("chat", {}).get("type") != "private":
        return None
    text = message.get("text") or message.get("caption")
    attachments = []
    if message.get("photo"):
        best = max(message["photo"], key=lambda size: size.get("file_size") or 0)
        attachments.append(
            Attachment("image", best["file_id"], "image/jpeg", best.get("file_size"))
        )
    for kind in ("voice", "audio", "document", "video"):
        if item := message.get(kind):
            attachments.append(
                Attachment(kind, item["file_id"], item.get("mime_type", ""), item.get("file_size"))
            )
    content = attachments[0].kind if attachments else "text" if text else "unsupported"
    chat = str(message["chat"]["id"])
    return Inbound("telegram", f"{chat}:{message['message_id']}", chat, text, content, attachments)


async def poll(db, settings, telegram: Telegram, offset=None):
    updates = await telegram.call(
        "getUpdates", offset=offset, timeout=10, allowed_updates=["message"]
    )
    for update in updates:
        if message := normalize(update):
            for reply in await ingest(db, settings, message, telegram.fetch):
                try:
                    await telegram.send(message.conversation_id, reply)
                except Exception as exc:
                    # The state is already durable; the citizen's next message re-prompts.
                    log_event(event="telegram_send_error", error=type(exc).__name__)
        # Telegram drops updates below the next offset, so advance only after durable storage.
        offset = update["update_id"] + 1
    return offset


async def deliver_notices(db, telegram: Telegram) -> int:
    """Sends each approved-plan notice to the Telegram citizens whose report it covers, once.

    The Communication agent writes the notice; this only delivers it. A notice id is recorded on
    the draft after sending, so a crash between both steps can repeat one message, never lose it.
    """
    since = now() - NOTICE_WINDOW
    async with db.sessions() as session:
        recipients = (
            await session.execute(
                select(InboundDraft, Association.incident_id)
                .join(Association, Association.report_id == InboundDraft.report_id)
                .where(
                    InboundDraft.channel == "telegram",
                    InboundDraft.status == "SUBMITTED",
                    InboundDraft.created_at >= since,
                )
            )
        ).all()
        notices = (
            await session.scalars(
                select(Notification)
                .join(DistributionPlan, DistributionPlan.id == Notification.plan_id)
                .where(DistributionPlan.status == "APPROVED", Notification.created_at >= since)
                .order_by(Notification.created_at, Notification.id)
            )
        ).all()
    sent = 0
    for draft, incident_id in recipients:
        done = set(draft.fields.get("notified", []))
        for notice in notices:
            if notice.id in done or incident_id not in notice.incident_ids:
                continue
            text = f"{notice.text}\n\nCódigo de tu reporte: {draft.report_id}"
            try:
                await telegram.send(draft.conversation_id, Prompt(text))
            except Exception as exc:
                # Not marked as notified: the next loop retries. Never log the chat id.
                log_event(event="telegram_notice_error", error=type(exc).__name__)
                continue
            async with db.sessions.begin() as session:
                row = await session.get(InboundDraft, draft.id)
                notified = [*row.fields.get("notified", []), notice.id]
                row.fields = {**row.fields, "notified": notified}
                (await session.get(Notification, notice.id)).status = "SENT"
            done.add(notice.id)
            sent += 1
            log_event(event="telegram_notice_sent", kind=notice.kind)
    return sent


async def deliver_zone_alerts(db, telegram: Telegram) -> int:
    """Warns each Telegram citizen of new incidents in the zone of their latest report, once.

    Only the latest submitted report of a chat counts, so reporting elsewhere moves the alerts
    to that zone. The text names the problem and the zone, never another citizen's report.
    """
    since = now() - ALERT_WINDOW
    async with db.sessions() as session:
        rows = (
            await session.execute(
                select(InboundDraft, Report)
                .join(Report, Report.id == InboundDraft.report_id)
                .where(
                    InboundDraft.channel == "telegram",
                    InboundDraft.status == "SUBMITTED",
                    Report.created_at >= since,
                )
                .order_by(Report.created_at, Report.id)
            )
        ).all()
        latest = {draft.conversation_id: (draft, report) for draft, report in rows}
        own: dict[str, set[str]] = {}
        for chat, incident_id in await session.execute(
            select(InboundDraft.conversation_id, Association.incident_id)
            .join(Association, Association.report_id == InboundDraft.report_id)
            .where(InboundDraft.channel == "telegram")
        ):
            own.setdefault(chat, set()).add(incident_id)
        zones = {report.community_id for _, report in latest.values()}
        incidents = (
            await session.scalars(
                select(Incident)
                .where(
                    Incident.community_id.in_(zones),
                    Incident.created_at >= since,
                    Incident.status != "CLOSED",
                )
                .order_by(Incident.created_at, Incident.id)
            )
        ).all()
        names = {
            c.id: c.name
            for c in await session.scalars(select(Community).where(Community.id.in_(zones)))
        }
    sent = 0
    for chat, (draft, report) in latest.items():
        done = set(draft.fields.get("zone_alerts", []))
        for incident in incidents:
            if (
                incident.id in done
                or incident.id in own.get(chat, ())
                or incident.community_id != report.community_id
                or incident.created_at <= report.created_at
            ):
                continue
            text = (
                f"HidroAgente informa: otro vecino reportó {PROBLEMS[incident.kind]} en "
                f"{names[incident.community_id]}, la zona de tu último reporte. "
                f"Ya está registrado para su atención; no necesitas reportarlo de nuevo."
            )
            try:
                await telegram.send(chat, Prompt(text))
            except Exception as exc:
                # Not marked: the next loop retries. Never log the chat id.
                log_event(event="telegram_zone_alert_error", error=type(exc).__name__)
                continue
            async with db.sessions.begin() as session:
                row = await session.get(InboundDraft, draft.id)
                row.fields = {
                    **row.fields,
                    "zone_alerts": [*row.fields.get("zone_alerts", []), incident.id],
                }
            done.add(incident.id)
            sent += 1
            log_event(event="telegram_zone_alert_sent", kind=incident.kind)
    return sent


async def run():
    settings = Settings()
    token = settings.telegram_bot_token.get_secret_value()
    if not token:
        raise SystemExit("Configura TELEGRAM_BOT_TOKEN en .env")
    db = Database(settings)
    offset = None
    try:
        async with httpx.AsyncClient(base_url="https://api.telegram.org", timeout=40) as client:
            telegram = Telegram(client, token)
            log_event(event="telegram_polling_started")
            while True:
                try:
                    offset = await poll(db, settings, telegram, offset)
                    await deliver_notices(db, telegram)
                    await deliver_zone_alerts(db, telegram)
                except TelegramError as exc:
                    if exc.code in FATAL:
                        raise SystemExit(
                            f"Telegram rechazó getUpdates ({exc.code}): {exc}"
                        ) from None
                    log_event(event="telegram_error", code=exc.code)
                    await asyncio.sleep(5)
                except Exception as exc:
                    # Poll boundary: log only the type (httpx errors embed the token in the URL).
                    log_event(event="telegram_error", error=type(exc).__name__)
                    await asyncio.sleep(5)
    finally:
        await db.engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
