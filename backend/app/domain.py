from app.contracts import DurationBucket, PriorityPolicyConfig, PriorityResult

DURATION_FRACTIONS: dict[DurationBucket, float] = {
    "LT_12H": 0.25,
    "H12_24": 0.5,
    "H24_48": 0.75,
    "GE_48H": 1,
}

DURATION_LABELS: dict[DurationBucket, str] = {
    "LT_12H": "menos de medio día",
    "H12_24": "entre medio día y un día",
    "H24_48": "entre uno y dos días",
    "GE_48H": "dos días o más",
}

DURATION_BOUNDS: dict[DurationBucket, tuple[float, float]] = {
    "LT_12H": (0, 12),
    "H12_24": (12, 24),
    "H24_48": (24, 48),
    "GE_48H": (48, 2161),
}


def calculate_priority(
    hours: float | None,
    critical: bool | None,
    vulnerability: float | None,
    population: int | None,
    policy: PriorityPolicyConfig | None = None,
    *,
    duration_bucket: DurationBucket | None = None,
) -> PriorityResult:
    policy = policy or PriorityPolicyConfig()
    if hours is not None and (not 0 <= hours <= 2160):
        raise ValueError("Horas fuera de rango")
    if vulnerability is not None and not 0 <= vulnerability <= 1:
        raise ValueError("Vulnerabilidad fuera de rango")
    if population is not None and population < 0:
        raise ValueError("Población fuera de rango")
    if duration_bucket is not None and (
        duration_bucket not in DURATION_FRACTIONS or hours is not None
    ):
        raise ValueError("Intervalo inválido o incompatible con horas exactas")
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
    if duration_bucket is not None:
        hours_fraction = DURATION_FRACTIONS[duration_bucket]
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


def explain_priority(priority: PriorityResult) -> str:
    """Describe the persisted inputs and points without model-generated factual claims."""
    inputs = priority.inputs
    if inputs is None:
        raise ValueError("La explicación requiere la instantánea del cálculo")
    if inputs.duration_bucket is not None:
        duration = (
            DURATION_LABELS[inputs.duration_bucket] + " (intervalo declarado; sin hora exacta)"
        )
    elif inputs.hours_without_water is not None:
        source = "campo ciudadano" if inputs.duration_source == "CITIZEN" else "texto ciudadano"
        duration = (
            f"{inputs.hours_without_water:g} horas ({source}; sin verificación independiente)"
        )
    else:
        duration = "no confirmada"
    critical = (
        "no confirmadas"
        if inputs.critical_institution is None
        else "mencionadas en texto ciudadano"
        if "CRITICIDAD_TEXTO" in priority.flags
        else "según catálogo"
        if inputs.critical_institution
        else "sin evidencia según catálogo"
    )
    population = (
        "no confirmada"
        if inputs.population is None
        else f"{inputs.population} habitantes del catálogo"
    )
    vulnerability = (
        "no confirmada"
        if inputs.vulnerability is None
        else f"índice {inputs.vulnerability:g} de 1 del catálogo"
    )
    descriptions = {
        "hours": f"Duración: {duration}",
        "critical": f"Instituciones críticas: {critical}",
        "vulnerability": f"Vulnerabilidad: {vulnerability}",
        "population": f"Población: {population}",
    }
    parts = [f"Propuesta determinista: {priority.score_min}–{priority.score_max}/100 puntos."]
    for name, description in descriptions.items():
        low, high = priority.factors[name]
        points = str(low) if low == high else f"{low}–{high}"
        parts.append(f"{description}: {points} puntos.")
    if inputs.is_synthetic:
        parts.append("Datos del sector sintéticos/estimados; no verificados oficialmente.")
    if priority.score_min != priority.score_max:
        parts.append("Rango por incertidumbre; no clasifica la urgencia como media.")
    if "CONTRADICCION_DURACION" in priority.flags:
        parts.append("Duración contradictoria: verificar las declaraciones.")
    if priority.immediate_review:
        parts.append("Alerta: requiere revisión inmediata por criticidad.")
    parts.append(
        f"Confianza de datos: {priority.confidence_level}; requiere decisión del coordinador."
    )
    return " ".join(parts)


def is_critical_location(props: dict | None) -> bool:
    """Determina si una entidad geográfica del catálogo es una institución crítica."""
    if not props:
        return False
    return props.get("category") == "institucion_critica"


def resolve_criticality(
    text_critical: bool | None, in_catalog: bool, catalog_critical: bool | None
) -> tuple[bool | None, list[str]]:
    """Resuelve la criticidad combinando evidencia textual y catálogo según D-02."""
    flags: list[str] = []
    if text_critical is True:
        flags.append("CRITICIDAD_TEXTO")
    if in_catalog and catalog_critical:
        flags.append("CRITICIDAD_CATALOGO")

    if text_critical is True or (in_catalog and catalog_critical):
        return True, flags
    if in_catalog and not catalog_critical and text_critical is not True:
        return False, flags
    return None, flags
