"""Conversación guiada del chatbot ciudadano. Sin DB ni red: inbox persiste, los canales envían."""

import json
import re
from dataclasses import dataclass, field

from pydantic import ValidationError

from app.contracts import ReportInput, plain
from app.models import now
from app.services import DATA

CATALOG = json.loads((DATA / "panama_oeste_corregimientos.json").read_text("utf-8"))
DISTRICTS = [(d["id"], d["name"]) for d in CATALOG["districts"]]
CORREGIMIENTOS = {
    d["id"]: [(c["id"], c["name"]) for c in d["corregimientos"]] for d in CATALOG["districts"]
}
NAMES = dict(DISTRICTS) | {key: name for rows in CORREGIMIENTOS.values() for key, name in rows}

# Keys are NormalizedReportSchema.kind in lower case; "other" has no backend kind and stays a
# pending draft. The declared kind is kept in the draft: ReportInput has no field to carry it.
KINDS = [
    ("outage", "No hay agua"),
    ("low_pressure", "Baja presión"),
    ("leak", "Fuga de agua"),
    ("other", "Otro problema"),
]
SUPPORTED = {"outage", "low_pressure", "leak"}
CONSENT = [("accept", "Acepto y comenzar"), ("cancel", "Cancelar")]
SKIP = [("skip", "Omitir")]
UNKNOWN = [("unknown", "No sé")]
EVIDENCE = [("done", "Listo, continuar"), ("skip", "Omitir")]
CONFIRM = [("confirm", "Confirmar"), ("edit", "Corregir"), ("cancel", "Cancelar")]
EDIT = [
    ("location", "Distrito y corregimiento"),
    ("locality", "Barriada"),
    ("kind", "Tipo de problema"),
    ("description", "Descripción"),
    ("duration", "Duración"),
    ("evidence", "Archivos"),
]
EDIT_STEPS = {
    "location": "DISTRICT",
    "locality": "LOCALITY",
    "kind": "KIND",
    "description": "DESCRIPTION",
    "duration": "DURATION",
    "evidence": "EVIDENCE",
}
RESTART = {"/start", "hola", "inicio", "reiniciar", "/reiniciar"}
STOP = {"cancelar", "/cancel", "/cancelar"}
UNITS = {
    **dict.fromkeys(["h", "hr", "hrs", "hora", "horas"], 1),
    **dict.fromkeys(["d", "dia", "dias"], 24),
    **dict.fromkeys(["semana", "semanas"], 168),
}

PROMPTS = {
    "CONSENT": (
        "Hola. Soy el asistente de AguaIA: te ayudo a reportar problemas con el suministro de "
        "agua en Panamá Oeste para que el equipo de coordinación los revise.\n\n"
        "Usaremos lo que nos envíes (ubicación aproximada, descripción, duración y archivos) solo "
        "para registrar y gestionar tu reporte. No te pediremos nombre ni cédula. "
        "¿Aceptas que guardemos estos datos?",
        CONSENT,
    ),
    "DISTRICT": ("¿En qué distrito ocurre el problema?", DISTRICTS),
    "LOCALITY": (
        "¿En qué barriada, comunidad o sector ocurre el problema? Escríbelo o elige Omitir.",
        SKIP,
    ),
    "KIND": ("¿Qué problema tienes con el suministro de agua?", KINDS),
    "DESCRIPTION": (
        "Cuéntanos qué sucede. Por ejemplo: «Llevamos desde ayer sin agua. Varias casas de la "
        "barriada están afectadas.»",
        [],
    ),
    "DURATION": (
        "¿Hace cuánto tiempo comenzó el problema? Escribe, por ejemplo, «12 horas» o «2 días».",
        UNKNOWN,
    ),
    "EVIDENCE": (
        "¿Quieres adjuntar fotos, notas de voz, audios o documentos? Envíalos ahora (puedes "
        "enviar varios) y luego elige «Listo, continuar», o elige Omitir.",
        EVIDENCE,
    ),
    "EDIT": ("¿Qué dato quieres corregir?", EDIT),
}
CANCELLED = "Reporte cancelado; no se registró nada. Escribe «Hola» si quieres empezar de nuevo."


@dataclass
class Prompt:
    text: str
    options: list[tuple[str, str]] = field(default_factory=list)

    def numbered(self) -> str:
        lines = [f"{number}. {label}" for number, (_, label) in enumerate(self.options, 1)]
        return "\n\n".join(filter(None, [self.text, "\n".join(lines)]))


def command(text):
    value = plain(text or "").strip(" .!¡")
    return "restart" if value in RESTART else "cancel" if value in STOP else None


def choose(text, options):
    """Accepts the option key (WhatsApp reply id), its number or its label (Telegram button)."""
    value = plain(text or "").strip(" .")
    for number, (key, label) in enumerate(options, 1):
        if value in (key, str(number), plain(label)):
            return key
    return None


def parse_hours(text):
    """Deterministic: a number (or un/una) plus a unit; anything else is ambiguous."""
    value = plain(text or "").strip(" .")
    match = re.fullmatch(r"(?:hace\s+)?(\d+(?:[.,]\d+)?|una?)\s*([a-z]+)", value)
    if not match or match[2] not in UNITS:
        return None
    amount = 1.0 if match[1] in ("un", "una") else float(match[1].replace(",", "."))
    hours = amount * UNITS[match[2]]
    return hours if hours <= 2160 else None


def report_input(fields, description=None) -> ReportInput:
    parts = [dict(KINDS)[fields["kind"]] + ".", description or fields["description"]]
    if fields.get("locality"):
        parts.append(f"Barriada o referencia: {fields['locality']}.")
    return ReportInput(
        community_id=fields["community_id"],
        description=" ".join(parts),
        hours_without_water=fields.get("hours"),
    )


def input_error(fields, description=None):
    try:
        report_input(fields, description)
    except ValidationError as exc:
        message = exc.errors()[0]["msg"].removeprefix("Value error, ")
        return message if "caracteres" not in message else "Tu descripción es demasiado larga."
    return None


def summary(fields) -> str:
    hours = fields.get("hours")
    duration = (
        "No indicada"
        if hours is None
        else f"{hours / 24:g} días"
        if hours >= 24 and hours % 24 == 0
        else f"{hours:g} horas"
    )
    description = fields["description"]
    lines = [
        "Revisa tu reporte:",
        f"Distrito: {NAMES[fields['district']]}",
        f"Corregimiento: {NAMES[fields['community_id']]}",
        f"Barriada o referencia: {fields.get('locality') or 'No indicada'}",
        f"Problema: {dict(KINDS)[fields['kind']]}",
        f"Descripción: {description if len(description) <= 300 else description[:299] + '…'}",
        f"Duración: {duration}",
        f"Archivos adjuntos: {fields.get('files', 0)}",
    ]
    return "\n".join(lines)


def prompt(fields, notes=()) -> Prompt:
    step = fields["step"]
    if step == "CONFIRM":
        text, options = summary(fields), CONFIRM
    elif step == "CORREGIMIENTO":
        district = fields["district"]
        text = f"¿En qué corregimiento de {NAMES[district]}?"
        options = CORREGIMIENTOS[district]
    else:
        text, options = PROMPTS[step]
    return Prompt("\n\n".join([*notes, text]), options)


def advance(fields: dict, text, files: list[dict]):
    """Applies one citizen message to `fields`; returns notes for the reply and an action."""
    step, notes = fields["step"], []
    stored = [f for f in files if f["status"] == "STORED"]
    if stored:
        fields["files"] = fields.get("files", 0) + len(stored)
        notes.append(f"Archivo guardado ({fields['files']} en total).")
    if len(stored) < len(files):
        notes.append("No pude guardar un archivo: se admiten fotos, audios, PDF o texto pequeños.")
    after = "CONFIRM" if fields.get("editing") else None
    if step == "CONSENT":
        key = choose(text, CONSENT)
        if key == "cancel":
            return notes, "cancel"
        if key == "accept":
            fields.update(step="DISTRICT", consented_at=now().isoformat())
    elif step == "DISTRICT":
        if key := choose(text, DISTRICTS):
            fields.update(step="CORREGIMIENTO", district=key, community_id=None)
    elif step == "CORREGIMIENTO":
        if key := choose(text, CORREGIMIENTOS[fields["district"]]):
            fields.update(step=after or "LOCALITY", community_id=key)
    elif step == "LOCALITY":
        if choose(text, SKIP):
            fields.update(step=after or "KIND", locality=None)
        elif text:
            locality = " ".join(text.split())
            if len(locality) > 120 or any(ord(c) < 32 for c in locality):
                notes.append("Escribe una referencia más corta (máximo 120 caracteres).")
            else:
                fields.update(step=after or "KIND", locality=locality)
    elif step == "KIND":
        if key := choose(text, KINDS):
            fields.update(step=after or "DESCRIPTION", kind=key)
    elif step == "DESCRIPTION":
        if text:
            description = " ".join(text.split())
            if error := input_error(fields, description):
                notes.append(error)
            else:
                fields.update(step=after or "DURATION", description=description)
                fields.pop("awaiting_transcription", None)
        elif any(f["kind"] in ("audio", "voice") for f in stored):
            # No transcription yet: the audio stays with the draft for the future agent.
            fields["awaiting_transcription"] = True
            notes.append(
                "Guardé tu audio sin transcribirlo. Para continuar, escribe una breve descripción."
            )
    elif step == "DURATION":
        if choose(text, UNKNOWN):
            fields.update(step=after or "EVIDENCE", hours=None)
        elif (hours := parse_hours(text)) is not None:
            fields.update(step=after or "EVIDENCE", hours=hours)
        elif text:
            notes.append(
                "No entendí la duración. Indica horas o días (máximo 90 días) o elige «No sé»."
            )
    elif step == "EVIDENCE":
        if choose(text, EVIDENCE):
            fields["step"] = "CONFIRM"
    elif step == "CONFIRM":
        key = choose(text, CONFIRM)
        if key == "confirm":
            # A later correction (e.g. the locality) could make the composed report invalid.
            error = input_error(fields) if fields["kind"] in SUPPORTED else None
            if error is None:
                return notes, "confirm"
            notes.append(error)
            fields.update(step="DESCRIPTION", editing=True)
        elif key == "cancel":
            return notes, "cancel"
        elif key == "edit":
            fields["step"] = "EDIT"
    elif step == "EDIT":
        if key := choose(text, EDIT):
            fields.update(step=EDIT_STEPS[key], editing=True)
    if fields["step"] == "CONFIRM":
        fields.pop("editing", None)
    return notes, None


def outcome(status, report_id) -> Prompt:
    """The code is the full report id, the same one the web form shows and /api/executions takes."""
    if status == "SUBMITTED":
        text = (
            f"Reporte registrado. Código de seguimiento: {report_id}\n\nEl equipo de coordinación "
            "lo revisará. Escribe «Hola» si quieres enviar otro reporte."
        )
    else:
        text = (
            "Guardamos tu reporte como pendiente de revisión: el equipo debe completarlo antes de "
            "registrarlo, por eso aún no tiene código. Escribe «Hola» para enviar otro reporte."
        )
    return Prompt(text)
