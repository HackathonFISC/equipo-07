from pydantic import Field, model_validator

from backend.contracts import Contract, PriorityInputs, PriorityResult


class PriorityPolicyConfig(Contract):
    version: str = "v1.0.0-demo"
    hours_weight: int = Field(default=35, ge=0)
    critical_weight: int = Field(default=30, ge=0)
    vulnerability_weight: int = Field(default=20, ge=0)
    population_weight: int = Field(default=15, ge=0)
    population_cap: int = Field(default=5000, gt=0)

    @model_validator(mode="after")
    def total(self) -> "PriorityPolicyConfig":
        if sum((self.hours_weight, self.critical_weight, self.vulnerability_weight,
                self.population_weight)) != 100:
            raise ValueError("Los pesos deben sumar 100")
        return self


def calculate_priority(
    inputs: PriorityInputs, policy: PriorityPolicyConfig | None = None
) -> PriorityResult:
    policy = policy or PriorityPolicyConfig()
    hours = inputs.hours
    hours_fraction = (0 if hours == 0 else 0.2 if hours <= 6 else 0.4 if hours <= 12
                      else 0.6 if hours <= 24 else 0.8 if hours <= 48 else 1) if hours is not None else None
    factors = {
        "hours": (hours_fraction, policy.hours_weight),
        "critical": (None if inputs.critical is None else float(inputs.critical), policy.critical_weight),
        "vulnerability": (inputs.vulnerability, policy.vulnerability_weight),
        "population": (None if inputs.population is None else min(inputs.population / policy.population_cap, 1), policy.population_weight),
    }
    low = sum(round(value * weight) for value, weight in factors.values() if value is not None)
    missing = [key for key, (value, _) in factors.items() if value is None]
    return PriorityResult(
        score_min=low,
        score_max=low + sum(factors[key][1] for key in missing),
        confidence_level="HIGH" if not missing else "MEDIUM" if len(missing) == 1 else "LOW",
        factors={key: f"{round(value * weight)}/{weight}" if value is not None
                 else f"desconocido: 0–{weight}" for key, (value, weight) in factors.items()},
        flags=["DATOS_INCOMPLETOS"] if missing else [],
        immediate_review=inputs.critical is True,
        policy_version=policy.version,
    )
