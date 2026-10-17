import pytest
from pydantic import ValidationError

from app.contracts import PriorityPolicyConfig, ReportInput
from app.domain import calculate_priority
from tests.conftest import AUTH


@pytest.mark.parametrize(
    ("hours", "points"), [(0, 0), (1, 9), (11.9, 9), (12, 18), (24, 26), (48, 35), (2160, 35)]
)
def test_hours_thresholds(hours, points):
    score = calculate_priority(hours, False, 0, 0)
    assert score.score_min == score.score_max == points


def test_unknown_not_penalized_and_critical_alert():
    empty = calculate_priority(None, None, None, None)
    assert (empty.score_min, empty.score_max, empty.confidence_level) == (0, 100, "LOW")
    critical = calculate_priority(None, True, None, None)
    assert critical.immediate_review and critical.score_min == 30 and critical.score_max == 100


def test_max_tie_and_custom_policy():
    assert calculate_priority(100, True, 1, 5000).score_min == 100
    assert calculate_priority(48, True, 1, 99999) == calculate_priority(100, True, 1, 5000)
    policy = PriorityPolicyConfig(
        hours_weight=100, critical_weight=0, vulnerability_weight=0, population_weight=0
    )
    assert calculate_priority(48, False, 0, 0, policy).score_min == 100
    with pytest.raises(ValidationError):
        PriorityPolicyConfig(hours_weight=101)


@pytest.mark.parametrize(
    "args",
    [
        (-1, None, None, None),
        (float("nan"), None, None, None),
        (10, True, 2, 0),
        (10, False, 0, -1),
    ],
)
def test_invalid_priority_data(args):
    with pytest.raises(ValueError):
        calculate_priority(*args)


@pytest.mark.parametrize(
    "text",
    [
        "Hay una fuga en la calle principal",
        "Se rompio el tubo y no sale nada",
        "Baja presion en las tuberias",
        "No sale nada de la pluma",
        "Corte de suministro en la barriada",
        "Los tanques y cisternas estan secos",
    ],
)
def test_report_input_accepts_water_terms(text):
    report = ReportInput(community_id="arraijan-demo", description=text, hours_without_water=12)
    assert report.description == text


async def test_geo_and_fleet_endpoints(system):
    geo_res = await system.client.get("/api/geo/locations")
    assert geo_res.status_code == 200
    geo_data = geo_res.json()
    assert geo_data["type"] == "FeatureCollection"
    assert len(geo_data["features"]) == 20

    # La flota es dato de coordinación: requiere token y nunca incluye datos de conductores.
    assert (await system.client.get("/api/admin/fleet")).status_code == 401
    fleet_res = await system.client.get("/api/admin/fleet", headers=AUTH)
    assert fleet_res.status_code == 200
    fleet_data = fleet_res.json()
    assert len(fleet_data) == 4
    assert all("driver" not in truck for truck in fleet_data)

    comm_res = await system.client.get("/api/communities")
    assert comm_res.status_code == 200
    communities = comm_res.json()
    # 23 demo/reference entries + 60 INEC 2023 corregimientos.
    assert len(communities) == 83
