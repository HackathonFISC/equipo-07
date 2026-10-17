import hashlib
import hmac
import json
from pathlib import Path

import httpx
import pytest
from sqlalchemy import delete, select

from app.integrations import chatbot, inbox, whatsapp
from app.integrations.models import InboundDraft, InboundMessage
from app.integrations.telegram import Telegram, poll
from app.models import Community, Report
from tests.conftest import AUTH, WHATSAPP_SECRET, WHATSAPP_VERIFY

IMAGE = b"\xff\xd8\xff fake jpeg"
VOICE = b"OggS fake opus"
MEDIA_ID = "1037543291543636"
LOOKASIDE = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1"
DESCRIPTION = "Llevamos desde ayer sin agua. Varias casas afectadas."


def wa_event(message):
    """Webhook `messages` con la forma documentada por WhatsApp Business Cloud API."""
    value = {
        "messaging_product": "whatsapp",
        "metadata": {"display_phone_number": "15550001111", "phone_number_id": "106540352242922"},
        "contacts": [{"profile": {"name": "Ciudadano Prueba"}, "wa_id": "50760000000"}],
        "messages": [{"from": "50760000000", "timestamp": "1760000000", **message}],
    }
    return {
        "object": "whatsapp_business_account",
        "entry": [{"id": "102290129340398", "changes": [{"field": "messages", "value": value}]}],
    }


async def post_wa(system, payload, secret=WHATSAPP_SECRET):
    body = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return await system.client.post(
        whatsapp.PATH,
        content=body,
        headers={"X-Hub-Signature-256": signature, "Content-Type": "application/json"},
    )


def graph(sent, status=200, url=LOOKASIDE):
    """Graph API simulada: envío de mensajes, metadatos del media id y descarga autenticada."""

    def handler(request):
        assert request.headers["Authorization"] == "Bearer test-access-token"
        if request.method == "POST":
            assert request.url.path == "/v23.0/106540352242922/messages"
            sent.append(json.loads(request.content))
            return httpx.Response(200, json={"messages": [{"id": "wamid.OUT"}]})
        if request.url.host == "graph.facebook.com":
            assert request.url.path == f"/v23.0/{MEDIA_ID}"
            info = {"url": url, "mime_type": "image/jpeg", "file_size": len(IMAGE), "id": MEDIA_ID}
            return httpx.Response(200, json=info)
        return httpx.Response(status, content=IMAGE)

    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


def shown(message):
    if message["type"] == "text":
        return message["text"]["body"]
    return message["interactive"]["body"]["text"]


class WhatsApp:
    """Ciudadano simulado: envía eventos firmados y devuelve lo que el bot respondió."""

    def __init__(self, system, monkeypatch, **media):
        self.system, self.sent, self.count, self.last = system, [], 0, None
        monkeypatch.setattr(whatsapp, "media_client", graph(self.sent, **media))

    async def post(self, payload):
        before = len(self.sent)
        assert (await post_wa(self.system, payload)).status_code == 200
        return [shown(message) for message in self.sent[before:]]

    async def say(self, content):
        self.count += 1
        if isinstance(content, str):
            content = {"type": "text", "text": {"body": content}}
        self.last = wa_event({"id": f"wamid.M{self.count}", **content})
        return await self.post(self.last)

    async def tap(self, option_id):
        reply = {"type": "button_reply", "button_reply": {"id": option_id, "title": "x"}}
        return await self.say({"type": "interactive", "interactive": reply})


def image(caption=None):
    body = {"mime_type": "image/jpeg", "sha256": "c2hh", "id": MEDIA_ID}
    if caption:
        body["caption"] = caption
    return {"type": "image", "image": body}


async def rows(system, model):
    async with system.db.sessions() as session:
        return (await session.scalars(select(model))).all()


async def ordered(system):
    messages = await rows(system, InboundMessage)
    return sorted(messages, key=lambda m: int(m.external_id.removeprefix("wamid.M")))


async def reach_confirm(chat):
    await chat.say("Hola")
    await chat.tap("accept")
    for answer in ("1", "Vacamonte", "Barriada Las Mañanitas", "1", DESCRIPTION, "2 días"):
        await chat.say(answer)
    return await chat.tap("skip")


async def test_catalog_is_complete_seeded_and_matches_inec_district_totals(system):
    # INEC, Censos 2023, Cuadro 3 (población por distrito).
    totals = {
        "arraijan": 299079,
        "capira": 45629,
        "chame": 28535,
        "la-chorrera": 258221,
        "san-carlos": 22201,
    }
    districts = chatbot.CATALOG["districts"]
    sums = {d["id"]: sum(c["population_2023"] for c in d["corregimientos"]) for d in districts}
    assert sums == totals
    ids = [c["id"] for d in districts for c in d["corregimientos"]]
    assert len(ids) == len(set(ids)) == 60
    # The backend knows every id the chatbot can send, under the same district.
    async with system.db.sessions() as session:
        seeded = (await session.execute(select(Community.id, Community.district))).all()
    expected = {(c["id"], d["name"]) for d in districts for c in d["corregimientos"]}
    assert expected <= set(seeded)


def test_duration_is_normalized_only_when_clear():
    parsed = [chatbot.parse_hours(t) for t in ("12 horas", "2 días", "una semana", "1,5 h")]
    assert parsed == [12, 48, 168, 1.5]
    for ambiguous in ("3", "desde ayer", "100 días", "dos semanas"):
        assert chatbot.parse_hours(ambiguous) is None


async def test_whatsapp_webhook_verification(system):
    params = {
        "hub.mode": "subscribe",
        "hub.verify_token": WHATSAPP_VERIFY,
        "hub.challenge": "1158201444",
    }
    ok = await system.client.get(whatsapp.PATH, params=params)
    assert ok.status_code == 200 and ok.text == "1158201444"
    bad = await system.client.get(whatsapp.PATH, params={**params, "hub.verify_token": "otro"})
    assert bad.status_code == 403


async def test_whatsapp_rejects_invalid_signature(system):
    payload = wa_event({"id": "wamid.F1", "type": "text", "text": {"body": "Hola"}})
    forged = await post_wa(system, payload, secret="otro-secreto")
    unsigned = await system.client.post(whatsapp.PATH, json=payload)
    assert forged.status_code == unsigned.status_code == 403
    assert await rows(system, InboundMessage) == []


async def test_whatsapp_conversation_registers_report_once(system, monkeypatch):
    chat = WhatsApp(system, monkeypatch)
    [welcome] = await chat.say("Hola")
    assert "No te pediremos nombre ni cédula" in welcome
    assert chat.sent[-1]["interactive"]["type"] == "button"
    await chat.tap("accept")
    assert len(chat.sent[-1]["interactive"]["action"]["sections"][0]["rows"]) == 5
    await chat.say("1")
    corregimientos = chat.sent[-1]["interactive"]["action"]["sections"][0]["rows"]
    assert len(corregimientos) == 9
    assert {"id": "corr-arraijan-vacamonte", "title": "Vacamonte"} in corregimientos
    for answer in ("Vacamonte", "Barriada Las Mañanitas", "1", DESCRIPTION):
        await chat.say(answer)
    [retry] = await chat.say("desde ayer")
    assert retry.startswith("No entendí la duración")
    await chat.say("2 días")
    [stored] = await chat.say(image())
    assert stored.startswith("Archivo guardado (1 en total)")
    [summary] = await chat.tap("done")
    for line in (
        "Distrito: Arraiján",
        "Corregimiento: Vacamonte",
        "Barriada o referencia: Barriada Las Mañanitas",
        "Problema: No hay agua",
        "Duración: 2 días",
        "Archivos adjuntos: 1",
    ):
        assert line in summary
    [done] = await chat.tap("confirm")
    assert await chat.post(chat.last) == []  # Meta redelivery: no new reply, no new report

    [draft] = await rows(system, InboundDraft)
    [report] = await rows(system, Report)
    # The code sent is the id of the report actually stored, usable on /api/executions.
    assert done.startswith(f"Reporte registrado. Código de seguimiento: {report.id}\n")
    assert (draft.status, draft.report_id, report.id) == ("SUBMITTED", draft.id, draft.id)
    # The declared kind survives submission in the draft, next to the report it produced.
    assert (draft.fields["kind"], draft.fields["district"]) == ("outage", "arraijan")
    assert (report.community_id, report.hours_without_water) == ("corr-arraijan-vacamonte", 48)
    assert report.description == (
        f"No hay agua. {DESCRIPTION} Barriada o referencia: Barriada Las Mañanitas."
    )
    messages = await ordered(system)
    # Before consent only the technical minimum is kept.
    assert (messages[0].status, messages[0].text) == ("PRE_CONSENT", None)
    [attachment] = next(m for m in messages if m.content_type == "image").attachments
    assert (Path(system.settings.media_path) / attachment["path"]).read_bytes() == IMAGE
    assert await system.work()
    status = (await system.client.get(f"/api/executions/{report.id}")).json()["status"]
    assert status == "WAITING_APPROVAL"
    listed = (await system.client.get("/api/admin/inbound", headers=AUTH)).json()
    assert {m["draft"]["status"] for m in listed} == {"SUBMITTED"}
    assert (await system.client.get("/api/admin/inbound")).status_code == 401


async def test_correction_changes_only_the_chosen_field(system, monkeypatch):
    chat = WhatsApp(system, monkeypatch)
    await reach_confirm(chat)
    await chat.tap("edit")
    await chat.tap("duration")
    [summary] = await chat.say("12 horas")
    assert "Duración: 12 horas" in summary and "Corregimiento: Vacamonte" in summary
    assert "Barriada o referencia: Barriada Las Mañanitas" in summary
    await chat.tap("edit")
    await chat.tap("location")
    await chat.say("La Chorrera")
    assert chat.sent[-1]["type"] == "text"  # 18 corregimientos: numbered selection
    [summary] = await chat.say("Puerto Caimito")
    assert "Distrito: La Chorrera" in summary and "Corregimiento: Puerto Caimito" in summary
    assert "Duración: 12 horas" in summary
    await chat.tap("confirm")
    [report] = await rows(system, Report)
    expected = ("corr-la-chorrera-puerto-caimito", 12)
    assert (report.community_id, report.hours_without_water) == expected
    [draft] = await rows(system, InboundDraft)
    assert (draft.fields["district"], draft.fields["community_id"]) == (
        "la-chorrera",
        "corr-la-chorrera-puerto-caimito",
    )
    async with system.db.sessions() as session:
        assert (await session.get(Community, report.community_id)).district == "La Chorrera"


async def test_failed_submission_keeps_draft_and_redelivery_sends_real_code(system, monkeypatch):
    chat = WhatsApp(system, monkeypatch)
    await reach_confirm(chat)
    real = inbox.submit_report

    async def unavailable(*args):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(inbox, "submit_report", unavailable)
    with pytest.raises(RuntimeError):  # the webhook answers 5xx, so Meta redelivers
        await chat.tap("confirm")
    [draft] = await rows(system, InboundDraft)
    assert (draft.status, draft.fields["community_id"], draft.fields["hours"]) == (
        "CONFIRMED",
        "corr-arraijan-vacamonte",
        48,
    )
    assert await rows(system, Report) == []
    monkeypatch.setattr(inbox, "submit_report", real)
    [done] = await chat.post(chat.last)
    [report] = await rows(system, Report)
    assert f"Código de seguimiento: {report.id}" in done
    assert await chat.post(chat.last) == []


async def test_unknown_corregimiento_in_backend_keeps_draft_pending(system, monkeypatch):
    async with system.db.sessions.begin() as session:
        await session.execute(delete(Community).where(Community.id == "corr-arraijan-vacamonte"))
    chat = WhatsApp(system, monkeypatch)
    await reach_confirm(chat)
    [result] = await chat.tap("confirm")
    assert "aún no tiene código" in result
    [draft] = await rows(system, InboundDraft)
    assert (draft.status, draft.missing, draft.report_id) == ("PENDING", ["community"], None)
    assert draft.fields["community_id"] == "corr-arraijan-vacamonte"
    assert await rows(system, Report) == []


async def test_other_problem_and_audio_only_description_stay_pending(system, monkeypatch):
    chat = WhatsApp(system, monkeypatch)
    await chat.say("Hola")
    await chat.tap("accept")
    await chat.say("Capira")
    await chat.say("Caimito")
    await chat.tap("skip")
    await chat.tap("other")
    audio = {"mime_type": "audio/ogg; codecs=opus", "id": MEDIA_ID, "voice": True}
    [note] = await chat.say({"type": "audio", "audio": audio})
    assert "sin transcribirlo" in note
    [draft] = await rows(system, InboundDraft)
    assert (draft.status, draft.missing, draft.fields["step"]) == (
        "COLLECTING",
        ["transcription"],
        "DESCRIPTION",
    )
    await chat.say("El agua sale turbia desde ayer")
    await chat.tap("unknown")
    await chat.tap("skip")
    [result] = await chat.tap("confirm")
    assert "pendiente de revisión" in result
    [draft] = await rows(system, InboundDraft)
    assert (draft.status, draft.missing, draft.report_id) == ("PENDING", ["kind"], None)
    assert await rows(system, Report) == []


async def test_cancel_and_media_before_consent_or_failed_download(system, monkeypatch):
    chat = WhatsApp(system, monkeypatch, status=500)
    [welcome] = await chat.say(image(caption="Sin agua"))
    assert "¿Aceptas" in welcome
    await chat.tap("accept")
    [note] = await chat.say(image())
    assert note.startswith("No pude guardar un archivo")
    monkeypatch.setattr(whatsapp, "media_client", graph(chat.sent, url="https://evil.example/f"))
    await chat.say(image())
    [bye] = await chat.say("cancelar")
    assert bye.startswith("Reporte cancelado")
    before, _, failed, untrusted, _ = await ordered(system)
    # Media sent before consent is never downloaded nor kept.
    assert (before.status, before.text, before.attachments) == ("PRE_CONSENT", None, [])
    assert failed.status == untrusted.status == "ATTACHMENT_ERROR"
    assert failed.attachments[0]["error"] == "HTTPStatusError"
    assert untrusted.attachments[0]["error"] == "UNTRUSTED_MEDIA_HOST"
    assert failed.attachments[0]["file_id"] == MEDIA_ID and "path" not in failed.attachments[0]
    [draft] = await rows(system, InboundDraft)
    assert draft.status == "CANCELLED"
    async with system.db.sessions() as session:
        assert await session.get(Community, "corr-chame-sora")  # shared catalog is seeded


def tg_update(update_id, **content):
    """Update de Telegram Bot API (getUpdates) de un chat privado."""
    chat = {"id": 7001, "first_name": "Prueba", "type": "private"}
    user = {"id": 7001, "is_bot": False, "first_name": "Prueba"}
    message = {"message_id": 100 + update_id, "from": user, "chat": chat, "date": 1760000000}
    return {"update_id": update_id, "message": {**message, **content}}


def telegram_api(updates, sent):
    files = {"VOICE_1": ("voice/file_2.oga", VOICE)}

    def handler(request):
        path = request.url.path
        if path.endswith("/getUpdates"):
            return httpx.Response(200, json={"ok": True, "result": updates})
        if path.endswith("/sendMessage"):
            sent.append(json.loads(request.content))
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})
        if path.endswith("/getFile"):
            file_id = json.loads(request.content)["file_id"]
            file_path, data = files[file_id]
            result = {"file_id": file_id, "file_size": len(data), "file_path": file_path}
            return httpx.Response(200, json={"ok": True, "result": result})
        for file_path, data in files.values():
            if path == f"/file/bot123:TEST/{file_path}":
                return httpx.Response(200, content=data)
        return httpx.Response(404, json={"ok": False, "error_code": 404, "description": "x"})

    transport = httpx.MockTransport(handler)
    return httpx.AsyncClient(base_url="https://api.telegram.org", transport=transport)


async def test_telegram_conversation_with_buttons_and_voice_note(system):
    voice = {"duration": 3, "mime_type": "audio/ogg", "file_id": "VOICE_1", "file_size": 14}
    texts = [
        "/start",
        "Acepto y comenzar",
        "Arraiján",
        "9",
        "Omitir",
        "Fuga de agua",
        "Hay una fuga de agua en la calle principal",
        "No sé",
    ]
    updates = [tg_update(i, text=t) for i, t in enumerate(texts, 1)]
    updates += [
        tg_update(9, voice=voice),
        tg_update(10, text="Listo, continuar"),
        tg_update(11, text="Confirmar"),
    ]
    sent = []
    async with telegram_api(updates, sent) as client:
        telegram = Telegram(client, "123:TEST")
        assert await poll(system.db, system.settings, telegram) == 12
        replies = len(sent)
        # Restart before acknowledging the offset: Telegram resends the same updates.
        assert await poll(system.db, system.settings, telegram, 12) == 12
    assert len(sent) == replies == 11
    keyboard = sent[0]["reply_markup"]["keyboard"]
    assert keyboard == [[{"text": "Acepto y comenzar"}, {"text": "Cancelar"}]]
    assert sent[-1]["text"].startswith("Reporte registrado")
    assert sent[-1]["reply_markup"] == {"remove_keyboard": True}
    [report] = await rows(system, Report)
    assert (report.community_id, report.hours_without_water) == ("corr-arraijan-vacamonte", None)
    assert report.description == "Fuga de agua. Hay una fuga de agua en la calle principal"
    [voice_message] = [m for m in await rows(system, InboundMessage) if m.content_type == "voice"]
    stored = Path(system.settings.media_path) / voice_message.attachments[0]["path"]
    assert stored.read_bytes() == VOICE


def test_reference_point_makes_the_report_routable():
    fields = {"step": "LOCALITY", "district": "arraijan", "community_id": "corr-arraijan-vacamonte"}
    fields["corregimiento"] = fields["community_id"]
    options = chatbot.prompt(fields).options
    assert ("ref-rey-vista-alegre", "Supermercados Rey Vista Alegre") in options
    # Institutions are never offered: a neighbour must not inherit a hospital's criticality.
    assert not any(key.startswith(("crit-", "pot-")) for key, _ in options)
    chatbot.advance(fields, "Supermercados Rey Vista Alegre", [])
    assert fields["community_id"] == "ref-rey-vista-alegre"
    assert "Corregimiento: Vacamonte" in chatbot.summary(
        {**fields, "kind": "outage", "description": DESCRIPTION}
    )
    # Editing the locality to free text returns the report to the corregimiento.
    fields["step"] = "LOCALITY"
    chatbot.advance(fields, "Barriada Las Mañanitas", [])
    assert fields["community_id"] == "corr-arraijan-vacamonte"


async def test_telegram_limits_new_reports_per_conversation(system):
    updates = [tg_update(i, text="/start") for i in range(1, inbox.DRAFTS_PER_HOUR + 2)]
    sent = []
    async with telegram_api(updates, sent) as client:
        await poll(system.db, system.settings, Telegram(client, "123:TEST"))
    assert sent[-1]["text"] == inbox.RATE_LIMITED
    assert len(await rows(system, InboundDraft)) == inbox.DRAFTS_PER_HOUR


async def test_approved_plan_notice_reaches_the_telegram_citizen_once(system):
    from app.agents import CommunicationAgent
    from app.worker import process_notifications
    from tests.test_evaluations import decide, details, planned, review

    texts = [
        "/start",
        "Acepto y comenzar",
        "Arraiján",
        "Vista Alegre",
        "Supermercados Rey Vista Alegre",
        "No hay agua",
        "Estamos sin agua desde hace 24 horas en toda la calle",
        "24 horas",
        "Omitir",
        "Confirmar",
    ]
    sent = []
    async with telegram_api([tg_update(i, text=t) for i, t in enumerate(texts, 1)], sent) as client:
        telegram = Telegram(client, "123:TEST")
        await poll(system.db, system.settings, telegram)
        [report] = await rows(system, Report)
        assert report.community_id == "ref-rey-vista-alegre"
        await system.work()
        priority = (await details(system, report.id))["proposal"]["priority"]
        score = (priority["score_min"] + priority["score_max"]) // 2
        assert (await review(system, report.id, approved_score=score)).status_code == 202
        await system.work()
        plan = await planned(system)
        assert (await decide(system, plan)).status_code == 200
        assert await process_notifications(system.db, CommunicationAgent(system.db))
        before = len(sent)
        from app.integrations.telegram import deliver_notices

        assert await deliver_notices(system.db, telegram) == 1
        assert await deliver_notices(system.db, telegram) == 0
    [notice] = sent[before:]
    assert notice["chat_id"] == "7001"
    assert "Primera entrega estimada" in notice["text"] and report.id in notice["text"]
