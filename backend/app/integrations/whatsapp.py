"""WhatsApp Business Cloud API (Meta): webhook firmado, descarga de media y respuestas."""

import hashlib
import hmac
import json
import secrets
from functools import partial
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.integrations.chatbot import Prompt
from app.integrations.inbox import Attachment, DownloadError, Inbound, download, ingest
from app.services import log_event

PATH = "/api/integrations/whatsapp/webhook"
# The media URL comes from the Graph API response, never from the citizen; still pin its host.
MEDIA_HOSTS = (".fbsbx.com", ".facebook.com", ".whatsapp.net", ".fbcdn.net")
router = APIRouter()


class SendNotConfigured(Exception):
    pass


def media_client():
    return httpx.AsyncClient(timeout=20)


def signature_ok(secret: str, body: bytes, header: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.encode(), expected.encode())


def normalize(payload) -> list[Inbound]:
    messages = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            for item in change.get("value", {}).get("messages", []):
                kind = item.get("type", "unknown")
                body = item.get(kind) if isinstance(item.get(kind), dict) else {}
                if kind == "audio" and body.get("voice"):
                    kind = "voice"
                attachments = (
                    [Attachment(kind, body["id"], body.get("mime_type", ""))]
                    if body.get("id")
                    else []
                )
                # A tapped button or list row arrives as its id, which the chatbot matches.
                reply = body.get("button_reply") or body.get("list_reply") or {}
                text = (
                    body.get("body")
                    if kind == "text"
                    else reply.get("id")
                    if kind == "interactive"
                    else body.get("caption")
                )
                messages.append(
                    Inbound("whatsapp", item["id"], item["from"], text, kind, attachments)
                )
    return messages


async def fetch_media(client, settings, attachment: Attachment, max_bytes) -> bytes:
    token = settings.whatsapp_access_token.get_secret_value()
    if not token:
        raise DownloadError("MISSING_ACCESS_TOKEN")
    if not (attachment.file_id.isascii() and attachment.file_id.isdigit()):
        raise DownloadError("INVALID_MEDIA_ID")
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.get(
        f"https://graph.facebook.com/{settings.whatsapp_graph_version}/{attachment.file_id}",
        headers=headers,
    )
    response.raise_for_status()
    info = response.json()
    url = urlsplit(info["url"])
    if url.scheme != "https" or not (url.hostname or "").endswith(MEDIA_HOSTS):
        raise DownloadError("UNTRUSTED_MEDIA_HOST")
    if int(info.get("file_size") or 0) > max_bytes:
        raise DownloadError("TOO_LARGE")
    return await download(client, info["url"], max_bytes, headers)


def outgoing(prompt: Prompt) -> dict:
    """Reply buttons for up to 3 short options, a list up to 10, numbered text beyond that."""
    body, options = prompt.numbered(), prompt.options
    if not options or len(options) > 10:
        return {"type": "text", "text": {"body": body[:4096]}}
    if len(options) <= 3 and all(len(label) <= 20 for _, label in options):
        replies = [{"type": "reply", "reply": {"id": k, "title": t}} for k, t in options]
        action, kind = {"buttons": replies}, "button"
    else:
        rows = [
            {"id": key, "title": label if len(label) <= 24 else label[:23] + "…"}
            for key, label in options
        ]
        action = {"button": "Ver opciones", "sections": [{"title": "Opciones", "rows": rows}]}
        kind = "list"
    interactive = {"type": kind, "body": {"text": body[:1024]}, "action": action}
    return {"type": "interactive", "interactive": interactive}


async def send(client, settings, to, prompt: Prompt):
    token = settings.whatsapp_access_token.get_secret_value()
    if not token or not settings.whatsapp_phone_number_id:
        raise SendNotConfigured("Configura WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID")
    response = await client.post(
        f"https://graph.facebook.com/{settings.whatsapp_graph_version}"
        f"/{settings.whatsapp_phone_number_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={"messaging_product": "whatsapp", "to": to, **outgoing(prompt)},
    )
    response.raise_for_status()


@router.get(PATH, response_class=PlainTextResponse)
async def verify(
    request: Request,
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token", max_length=256),
    challenge: str = Query("", alias="hub.challenge", max_length=256),
):
    expected = request.app.state.settings.whatsapp_verify_token.get_secret_value()
    if (
        not expected
        or mode != "subscribe"
        or not secrets.compare_digest(token.encode(), expected.encode())
    ):
        raise HTTPException(403, "Verificación del webhook rechazada")
    return challenge


@router.post(PATH)
async def receive(request: Request):
    settings = request.app.state.settings
    secret = settings.whatsapp_app_secret.get_secret_value()
    if not secret:
        raise HTTPException(503, "Configura WHATSAPP_APP_SECRET")
    body = await request.body()
    if not signature_ok(secret, body, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(403, "Firma inválida")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(400, "JSON inválido") from None
    # shortcut: media downloads inline before the 200; move to a retry job if Meta times out.
    async with media_client() as client:
        fetch = partial(fetch_media, client, settings)
        for message in normalize(payload):
            for reply in await ingest(request.app.state.db, settings, message, fetch):
                try:
                    await send(client, settings, message.conversation_id, reply)
                except Exception as exc:
                    # The state is already durable; the citizen's next message re-prompts.
                    log_event(event="whatsapp_send_error", error=type(exc).__name__)
    # 200 only after every message is durable; an exception returns 5xx and Meta redelivers.
    return {"status": "received"}
