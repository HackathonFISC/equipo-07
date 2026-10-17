import re
import unicodedata
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def plain(text: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", text.lower())
        if not unicodedata.combining(char)
    )


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ExecutionReceipt(Contract):
    report_id: UUID
    thread_id: UUID
    status: Literal[
        "QUEUED",
        "RUNNING",
        "WAITING_APPROVAL",
        "RESUME_QUEUED",
        "APPROVED",
        "REJECTED",
        "ERROR",
        "NEEDS_INFORMATION",
    ]
    is_simulated: bool


class ReportInput(Contract):
    community_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    description: str = Field(min_length=8, max_length=2000)
    hours_without_water: float | None = Field(
        default=None, ge=0, le=2160, allow_inf_nan=False, strict=True
    )

    @field_validator("description")
    @classmethod
    def guard_text(cls, value: str) -> str:
        text = plain(value)
        if any(ord(c) < 32 and c not in "\n\t" for c in value):
            raise ValueError("Caracteres de control no permitidos")
        if re.search(
            r"(ignora|ignore|olvida|override).{0,40}(instrucciones|instructions|reglas|system)"
            r"|system\s*:|<\|.*?\|>|(revela|muestra).{0,20}(token|secret|clave)",
            text,
        ):
            raise ValueError("El reporte contiene instrucciones ajenas al servicio")
        if not re.search(
            r"\b(aguas?|acueductos?|tuberias?|tubos?|grifos?|plumas?|llaves?|fugas?|suministros?"
            r"|presion(es)?|cisternas?|tanques?|potables?|hidrantes?|bombas?|valvulas?|cortes?"
            r"|suspension(es)?|desabastecimientos?|filtracion(es)?|roturas?|goteos?|goteras?"
            # Jerga y términos locales (F4-03): «no cae ni una gota», «el IDAAN no viene».
            r"|chorros?|gotas?|idaan|medidor(es)?|mangueras?|acometidas?|no cae)\b",
            text,
        ):
            raise ValueError("Describe un problema del servicio de agua")
        return " ".join(value.split())


class NormalizedReportSchema(Contract):
    summary: str = Field(min_length=1, max_length=2000)
    kind: Literal["OUTAGE", "LOW_PRESSURE", "LEAK", "UNKNOWN"]
    hours_without_water: float | None = Field(default=None, ge=0, le=2160)
    critical_institution: bool | None = None
    flags: list[str] = Field(default_factory=list, max_length=12)


class DuplicateEvaluationSchema(Contract):
    match_confidence: Literal["HIGH", "MEDIUM", "LOW"]
    matched_incident_id: UUID | None = None
    reasoning: str = Field(min_length=1, max_length=600)

    @model_validator(mode="after")
    def match_required(self) -> "DuplicateEvaluationSchema":
        if (self.match_confidence != "LOW") != (self.matched_incident_id is not None):
            raise ValueError("HIGH/MEDIUM requieren candidato; LOW requiere null")
        return self


class CoordinationProposalSchema(Contract):
    explanation: str = Field(min_length=1, max_length=1200)


class ImageEvidenceSchema(Contract):
    """Advisory reading of a citizen photo for the coordinator; it never changes the score."""

    description: str = Field(min_length=1, max_length=200)
    relevant: bool | None = None


class ReviewInput(Contract):
    decision: Literal["APPROVE", "REJECT", "CORRECT"]
    reason: str = Field(min_length=5, max_length=600)
    approved_score: int | None = Field(default=None, ge=0, le=100, strict=True)
    corrected_score: int | None = Field(default=None, ge=0, le=100, strict=True)
    association: Literal["CONFIRM", "NEW"] | None = None

    @model_validator(mode="after")
    def correction(self) -> "ReviewInput":
        if (self.decision == "CORRECT") != (self.corrected_score is not None):
            raise ValueError("Solo CORRECT requiere corrected_score entre 0 y 100")
        if self.decision != "APPROVE" and self.approved_score is not None:
            raise ValueError("approved_score solo aplica a decision APPROVE")
        return self


class PriorityPolicyConfig(Contract):
    version: str = "v1.0.0-demo"
    hours_weight: int = Field(default=35, ge=0)
    critical_weight: int = Field(default=30, ge=0)
    vulnerability_weight: int = Field(default=20, ge=0)
    population_weight: int = Field(default=15, ge=0)

    @model_validator(mode="after")
    def total(self) -> "PriorityPolicyConfig":
        if (
            sum(
                (
                    self.hours_weight,
                    self.critical_weight,
                    self.vulnerability_weight,
                    self.population_weight,
                )
            )
            != 100
        ):
            raise ValueError("Las ponderaciones deben sumar 100")
        return self


class PlannerPolicyConfig(Contract):
    version: str = "v1.0.0-demo"
    # Supuestos explícitos: velocidad urbana media y tortuosidad del dataset de referencia.
    speed_kmh: float = Field(default=30, gt=0, le=90)
    tortuosity: float = Field(default=1.4, ge=1, le=3)


class PlanDemand(Contract):
    community_id: str
    name: str
    incident_ids: list[str]
    score: int = Field(ge=0, le=100)
    critical: bool
    lat: float
    lng: float
    gallons: int = Field(gt=0)
    max_truck_capacity: int = Field(gt=0)


class PlanTruck(Contract):
    id: str
    name: str
    capacity: int = Field(gt=0)
    base_id: str
    base_name: str
    base_lat: float
    base_lng: float
    shift_start: str = Field(pattern=r"^\d{2}:\d{2}$")
    shift_end: str = Field(pattern=r"^\d{2}:\d{2}$")
    flow_gpm: float = Field(gt=0)
    refill_minutes: int = Field(ge=0)
    setup_minutes: int = Field(ge=0)
    km_per_gallon: float = Field(gt=0)


class PlanStop(Contract):
    community_id: str
    name: str
    incident_ids: list[str]
    trip: int
    arrival: str
    gallons: int
    reason: str


class TruckRoute(Contract):
    truck_id: str
    truck_name: str
    capacity: int
    base_name: str
    shift: str
    trips: int
    km: float
    fuel_gallons: float
    gallons: int
    ends_at: str | None
    stops: list[PlanStop]


class UnservedDemand(Contract):
    community_id: str
    name: str
    incident_ids: list[str]
    reason: Literal[
        "COBERTURA_PARCIAL",
        "SIN_CISTERNA_COMPATIBLE",
        "SIN_TIEMPO_EN_TURNO",
        "SIN_UBICACION",
        "SIN_DEMANDA_ESTIMADA",
        "FUGA_REQUIERE_REPARACION",
    ]
    gallons_missing: int | None
    detail: str


class PlanResult(Contract):
    policy_version: str
    routes: list[TruckRoute]
    unserved: list[UnservedDemand]
    demand_gallons: int
    planned_gallons: int
    explanation: list[str]


class PlanRequest(Contract):
    unavailable_trucks: list[str] = Field(default_factory=list, max_length=20)


class PlanReviewInput(Contract):
    decision: Literal["APPROVE", "REJECT"]
    reason: str = Field(min_length=5, max_length=600)


class PriorityResult(Contract):
    score_min: int = Field(ge=0, le=100)
    score_max: int = Field(ge=0, le=100)
    confidence_level: Literal["HIGH", "MEDIUM", "LOW"]
    factors: dict[str, list[int]]
    flags: list[str]
    policy_version: str
    immediate_review: bool


class NotificationOut(Contract):
    id: str
    plan_id: str
    community_id: str
    incident_ids: list[str]
    kind: Literal["SCHEDULED", "UNSERVED"]
    text: str
    arrival: str | None = None
    status: Literal["READY", "SENT", "FAILED"]
    created_at: datetime


class PublicReportNotice(Contract):
    kind: Literal["SCHEDULED", "UNSERVED"]
    text: str
    arrival: str | None = None


class PublicReportStatus(Contract):
    report_id: UUID
    status: Literal[
        "QUEUED",
        "RUNNING",
        "WAITING_APPROVAL",
        "RESUME_QUEUED",
        "APPROVED",
        "REJECTED",
        "ERROR",
        "NEEDS_INFORMATION",
    ]
    incident_status: Literal["OPEN", "PRIORITIZED", "SCHEDULED", "CLOSED"] | None = None
    notice: PublicReportNotice | None = None


class IncidentTimelineEvent(Contract):
    timestamp: datetime
    source: Literal["report", "trace", "review", "plan", "notification"]
    event: str
    summary: str
    detail: dict = Field(default_factory=dict)
