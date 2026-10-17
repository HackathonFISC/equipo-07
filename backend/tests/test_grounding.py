import pytest

from app.grounding import critical_evidence, extract_temporal_grounding, stated_hours


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("No hay agua en el hospital", True),
        ("Hospital sin agua desde hace 24 horas", True),
        ("Estamos sin agua en la escuela República de Costa Rica", True),
        ("En el centro de salud no sale ni una gota", True),
        ("La policlínica Santiago Barraza está sin suministro", True),
        ("El asilo de ancianos requiere agua urgente", True),
        ("MINSA-Capsi sin agua potable", True),
        ("Subcentro de salud reporta desabastecimiento", True),
        ("El corte general no afecta al hospital", None),
        ("Rotura de tubería sin afectar a la policlinica", None),
        ("Ninguna escuela afectada por la suspensión", None),
        ("Se restablece el servicio excepto centro de salud", None),
        ("Estamos sin agua en la barriada Las Lajas", None),
        ("Hay una fuga en la calle principal", None),
    ],
)
def test_critical_evidence(text, expected):
    assert critical_evidence(text) == expected


@pytest.mark.parametrize(
    ("text", "expected_hours"),
    [
        ("Llevamos 24 horas sin agua", [24.0]),
        ("Corte de 12 hrs", [12.0]),
        ("Llevamos 24 oras sin agua", [24.0]),
        ("Sin agua desde hace tres horas", [3.0]),
        ("Llevamos 1 dia sin agua", [24.0]),
        ("Sin agua desde hace 3 días", [72.0]),
        ("Van dos dias sin suministro", [48.0]),
        ("Llevamos medio dia con baja presion", [12.0]),
        # «Medio día» as a time of day (noon) is not a duration.
        ("Sin agua desde el medio día de ayer", []),
        ("Se fue el agua al medio dia", []),
        ("Corte de 1 semana", [168.0]),
        ("Llevamos dos semanas sin una gota", [336.0]),
        ("Calle 4 casa 2 llevamos 2 días sin agua", [48.0]),
        ("Consulta general sobre el suministro", []),
    ],
)
def test_stated_hours(text, expected_hours):
    assert stated_hours(text) == expected_hours


@pytest.mark.parametrize(
    ("text", "is_imprecise"),
    [
        ("Estamos sin agua desde ayer", True),
        ("No hay agua desde anteayer", True),
        ("Sin agua desde el lunes", True),
        ("Llevamos 24 horas sin agua", False),
        ("Sin agua desde hace 3 días", False),
    ],
)
def test_temporal_grounding_imprecise(text, is_imprecise):
    grounding = extract_temporal_grounding(text)
    assert grounding.is_imprecise == is_imprecise
