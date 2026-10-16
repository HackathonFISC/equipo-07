from app.contracts import PriorityPolicyConfig, PriorityResult


def calculate_priority(
    hours: float | None,
    critical: bool | None,
    vulnerability: float | None,
    population: int | None,
    policy: PriorityPolicyConfig | None = None,
) -> PriorityResult:
    policy = policy or PriorityPolicyConfig()
    if hours is not None and (not 0 <= hours <= 2160):
        raise ValueError("Horas fuera de rango")
    if vulnerability is not None and not 0 <= vulnerability <= 1:
        raise ValueError("Vulnerabilidad fuera de rango")
    if population is not None and population < 0:
        raise ValueError("Población fuera de rango")
    hours_fraction = (
        None
        if hours is None
        else (
            0
            if hours == 0
            else 0.25
            if hours < 12
            else 0.5
            if hours < 24
            else 0.75
            if hours < 48
            else 1
        )
    )
    values = {
        "hours": (hours_fraction, policy.hours_weight),
        "critical": (None if critical is None else float(critical), policy.critical_weight),
        "vulnerability": (vulnerability, policy.vulnerability_weight),
        "population": (
            None if population is None else min(population / 5000, 1),
            policy.population_weight,
        ),
    }
    factors = {
        name: [0, weight] if value is None else [round(value * weight)] * 2
        for name, (value, weight) in values.items()
    }
    missing = sum(value is None for value, _ in values.values())
    return PriorityResult(
        score_min=sum(bounds[0] for bounds in factors.values()),
        score_max=sum(bounds[1] for bounds in factors.values()),
        confidence_level="HIGH" if missing == 0 else "MEDIUM" if missing <= 2 else "LOW",
        factors=factors,
        flags=["DATOS_INCOMPLETOS"] if missing else [],
        policy_version=policy.version,
        immediate_review=critical is True,
    )
