from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReportInput(Contract):
    sector_id: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=10, max_length=2000)
    hours_without_water: float | None = Field(default=None, ge=0, le=720, allow_inf_nan=False)

    @field_validator("description")
    @classmethod
    def clean_text(cls, value: str) -> str:
        if any(ord(c) < 32 and c not in "\n\t" for c in value):
            raise ValueError("Caracteres de control no permitidos")
        return " ".join(value.split())


class NormalizedReportSchema(Contract):
    summary: str = Field(min_length=1, max_length=2000)
    incident_type: Literal["OUTAGE", "LOW_PRESSURE", "LEAK", "UNKNOWN"]
    hours_without_water: float | None = Field(default=None, ge=0, le=720, allow_inf_nan=False)
    hours_evidence: str | None = Field(default=None, max_length=100)
    critical_evidence: str | None = Field(default=None, max_length=200)
    in_scope: bool
    flags: list[str] = Field(default_factory=list, max_length=20)


class Candidate(Contract):
    id: UUID
    sector_id: str
    incident_type: str
    description: str


class DuplicateEvaluationSchema(Contract):
    match_confidence: Literal["HIGH", "MEDIUM", "LOW"]
    matched_incident_id: UUID | None = None
    reasoning: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def require_match(self) -> "DuplicateEvaluationSchema":
        if self.match_confidence != "LOW" and self.matched_incident_id is None:
            raise ValueError("Una coincidencia debe identificar un candidato")
        return self


class PriorityInputs(Contract):
    hours: float | None = Field(default=None, ge=0, le=720, allow_inf_nan=False)
    critical: bool | None = None
    vulnerability: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    population: int | None = Field(default=None, ge=0, le=1000000, strict=True)


class PriorityResult(Contract):
    score_min: int = Field(ge=0, le=100)
    score_max: int = Field(ge=0, le=100)
    confidence_level: Literal["HIGH", "MEDIUM", "LOW"]
    factors: dict[str, str]
    flags: list[str]
    immediate_review: bool
    policy_version: str


class CoordinationProposalSchema(Contract):
    explanation: str = Field(min_length=1, max_length=1500)


class ReviewInput(Contract):
    decision: Literal["APPROVE", "REJECT", "CORRECT"]
    reason: str = Field(min_length=5, max_length=1000)
    corrections: PriorityInputs | None = None
    association: Literal["MATCH", "NEW"] | None = None

    @model_validator(mode="after")
    def validate_correction(self) -> "ReviewInput":
        if (self.decision == "CORRECT") != (self.corrections is not None):
            raise ValueError("CORRECT requiere factores corregidos; otras decisiones no los admiten")
        return self
