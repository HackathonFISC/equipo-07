"""Lógica pura de fundamentación lingüística (grounding) para extracción de reportes."""

import re
from dataclasses import dataclass

from app.contracts import plain

WORD_NUMBERS = {
    "un": 1,
    "una": 1,
    "uno": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
}

CRITICAL_INSTITUTIONS_RE = (
    r"(?:hospital(?:es)?|policlinica(?:s)?|escuela(?:s)?|asilo(?:s)?|"
    r"centro(?:s)? de salud|minsa-capsi|subcentro(?:s)? de salud|colegio(?:s)?|primer ciclo)"
)

# Negación acotada: solo cuando niega la afectación o presencia del problema en la institución
CRITICAL_NEGATION_RE = re.compile(
    rf"\b(?:no afecta(?:n)?|sin afectar|ningun(?:a)?|excepto)\b\s*"
    rf"(?:a(?:l| la| los| las)?\s*)?{CRITICAL_INSTITUTIONS_RE}\b"
)


def critical_evidence(text: str) -> bool | None:
    """Evalúa si el texto del reporte contiene evidencia de institución crítica afectada."""
    text = plain(text)
    if re.search(rf"\b{CRITICAL_INSTITUTIONS_RE}\b", text):
        if CRITICAL_NEGATION_RE.search(text):
            return None
        return True
    return None


IMPRECISE_TIME_RE = re.compile(
    r"\b(?:desde ayer|desde anteayer|desde el lunes|desde el martes|desde el miercoles|"
    r"desde el jueves|desde el viernes|desde el sabado|desde el domingo|hace dias|hace rato|"
    r"hace varios dias|desde hace dias|desde la manana|desde la tarde|desde anoche)\b"
)


@dataclass(frozen=True)
class TemporalGrounding:
    hours: list[float]
    is_imprecise: bool


def stated_hours(text: str) -> list[float]:
    """Extrae las duraciones explícitas del texto convertidas a horas."""
    lowered = plain(text)
    hours: list[float] = []

    # 1. Horas explícitas con dígitos: "24 horas", "1.5 hora", "12h"
    for match in re.finditer(r"(?<![\d.-])(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?)\b", lowered):
        val = float(match.group(1).replace(",", "."))
        hours.append(val)

    # 2. Horas en palabras: "dos horas", "tres horas"
    for word, num in WORD_NUMBERS.items():
        if re.search(rf"\b{word}\s+(?:horas?|hrs?)\b", lowered):
            hours.append(float(num))

    # 3. Días explícitos con dígitos: "3 días", "1.5 dias"
    for match in re.finditer(r"(?<![\d.-])(\d+(?:[.,]\d+)?)\s*dias?\b", lowered):
        val = float(match.group(1).replace(",", "."))
        hours.append(val * 24.0)

    # 4. Días en palabras: "un día", "dos días", "tres días"
    for word, num in WORD_NUMBERS.items():
        if re.search(rf"\b{word}\s+dias?\b", lowered):
            hours.append(float(num * 24))

    # "medio día" as a duration; "el/al/del medio día" is noon, a time of day.
    if re.search(r"(?<!\bel )(?<!\bal )(?<!\bdel )\bmedio\s+dia\b", lowered):
        hours.append(12.0)

    # 5. Semanas explícitas con dígitos: "2 semanas"
    for match in re.finditer(r"(?<![\d.-])(\d+(?:[.,]\d+)?)\s*semanas?\b", lowered):
        val = float(match.group(1).replace(",", "."))
        hours.append(val * 168.0)

    # 6. Semanas en palabras: "una semana", "dos semanas"
    for word, num in WORD_NUMBERS.items():
        if re.search(rf"\b{word}\s+semanas?\b", lowered):
            hours.append(float(num * 168))

    return hours


def extract_temporal_grounding(text: str) -> TemporalGrounding:
    """Extrae horas y determina si el texto contiene una duración imprecisa."""
    lowered = plain(text)
    hours = stated_hours(text)
    is_imprecise = bool(IMPRECISE_TIME_RE.search(lowered))
    return TemporalGrounding(hours=hours, is_imprecise=is_imprecise)
