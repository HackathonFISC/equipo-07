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

# A bound or range is never an exact duration; retain its wording in the original report.
TIME_NUMBER = r"(?:\d+(?:[.,]\d+)?|medio|" + "|".join(WORD_NUMBERS) + ")"
TIME_RANGE_RE = re.compile(
    rf"\b(?:entre|de)\s+{TIME_NUMBER}\s+(?:horas?|dias?|semanas?)\s+"
    rf"(?:y|a|hasta)\s+{TIME_NUMBER}\b|"
    rf"\b(?:entre|de)\s+{TIME_NUMBER}\s+(?:y|a|hasta)\s+{TIME_NUMBER}\s+"
    r"(?:horas?|dias?|semanas?)\b|"
    r"\b(?:mas de|menos de|al menos|hasta|aproximadamente|alrededor de|unas?|casi)\s+"
    rf"{TIME_NUMBER}\s*(?:horas?|hrs?|h|dias?|semanas?)\b|"
    rf"\b{TIME_NUMBER}\s+(?:horas?|dias?|semanas?)\s+o\s+mas\b|"
    r"\b\d+\s*[-–]\s*\d+\s*(?:horas?|dias?)\b"
)


@dataclass(frozen=True)
class TemporalGrounding:
    hours: list[float]
    is_imprecise: bool


# «y media» / «y medio» right after the unit adds half of it: «1 hora y media» is 1.5 h,
# «3 días y medio» is 84 h. Without it the model's correct answer failed the grounding gate.
HALF = r"(\s+y\s+medi[ao])?"
UNITS = (
    # «24 oras» is a common misspelling a model does read as hours; «24h» is the short form.
    (r"(?:h?oras?|hrs?|h)", 1.0),
    (r"dias?", 24.0),
    (r"semanas?", 168.0),
)


def stated_hours(text: str) -> list[float]:
    """Extrae las duraciones explícitas del texto convertidas a horas."""
    lowered = plain(text)
    hours: list[float] = []
    if TIME_RANGE_RE.search(lowered):
        return hours

    for unit, factor in UNITS:
        # Con dígitos: "24 horas", "24h", "1.5 dias", "2 semanas".
        for match in re.finditer(rf"(?<![\d.-])(\d+(?:[.,]\d+)?)\s*{unit}\b{HALF}", lowered):
            value = float(match.group(1).replace(",", "."))
            hours.append((value + (0.5 if match.group(2) else 0)) * factor)
        # En palabras: "dos horas", "un día y medio", "una semana".
        for word, num in WORD_NUMBERS.items():
            for match in re.finditer(rf"\b{word}\s+{unit}\b{HALF}", lowered):
                hours.append((num + (0.5 if match.group(1) else 0)) * factor)

    # "medio día" as a duration; "el/al/del medio día" is noon, a time of day.
    if re.search(r"(?<!\bel )(?<!\bal )(?<!\bdel )\bmedio\s+dia\b", lowered):
        hours.append(12.0)

    return hours


def extract_temporal_grounding(text: str) -> TemporalGrounding:
    """Extrae horas y determina si el texto contiene una duración imprecisa."""
    lowered = plain(text)
    hours = stated_hours(text)
    is_imprecise = bool(IMPRECISE_TIME_RE.search(lowered) or TIME_RANGE_RE.search(lowered))
    return TemporalGrounding(hours=hours, is_imprecise=is_imprecise)
