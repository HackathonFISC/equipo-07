import json
from pathlib import Path

from app.impact import ScenarioReport, build_demands, compare, ordered_demands, trucks_from_catalog
from app.services import fleet_catalog, location_catalog
from tests.conftest import AUTH
from tests.test_evaluations import details, planned, review, submit

ROOT = Path(__file__).resolve().parents[2]
LOCATIONS = location_catalog()
COMMUNITIES = {"ref-rey-vista-alegre": {"population": 4000, "vulnerability": 0.6}}


def scenario():
    # A loud non-critical sector reports first and often; the hospital reports once, last.
    noisy = [
        ScenarioReport(i, "ref-rey-vista-alegre", "Sin agua desde hace 24 horas", 24, "OUTAGE")
        for i in range(1, 6)
    ]
    return [
        *noisy,
        ScenarioReport(6, "ref-parque-feuillet", "Fuga en la calle", None, "LEAK"),
        ScenarioReport(7, "arraijan-demo", "Sin agua desde hace 24 horas", 24, "OUTAGE"),
        ScenarioReport(8, "crit-hosp-nicolas-solano", "Hospital sin agua 24 horas", 24, "OUTAGE"),
    ]


def one_truck():
    fleet = [t for t in fleet_catalog() if t["id"] == "cisterna-troncal-02"]
    return trucks_from_catalog(fleet, LOCATIONS, set())


def test_build_demands_groups_and_skips_like_planner():
    demands, skipped = build_demands(scenario(), COMMUNITIES, LOCATIONS)
    assert skipped == {
        "arraijan-demo": "SIN_UBICACION",
        "ref-parque-feuillet": "FUGA_REQUIERE_REPARACION",
    }
    by_id = {d.plan.community_id: d for d in demands}
    assert by_id["ref-rey-vista-alegre"].reports == 5
    assert by_id["crit-hosp-nicolas-solano"].plan.critical is True
    assert by_id["crit-hosp-nicolas-solano"].plan.score > by_id["ref-rey-vista-alegre"].plan.score


def test_baselines_get_unique_ranks_without_critical_tiebreak():
    demands, _ = build_demands(scenario(), COMMUNITIES, LOCATIONS)
    for strategy in ("volumen", "llegada"):
        ordered = ordered_demands(demands, strategy)
        assert len({d.score for d in ordered}) == len(ordered)
        assert not any(d.critical for d in ordered)
    volume = sorted(ordered_demands(demands, "volumen"), key=lambda d: -d.score)
    assert volume[0].community_id == "ref-rey-vista-alegre"


def test_scarce_fleet_aguaia_serves_hospital_first():
    demands, _ = build_demands(scenario(), COMMUNITIES, LOCATIONS)
    report = compare(demands, one_truck())
    aguaia, volume = report["strategies"]["aguaia"], report["strategies"]["volumen"]
    assert aguaia["order"][0] == "crit-hosp-nicolas-solano"
    assert volume["order"][0] == "ref-rey-vista-alegre"
    wait = "critical_first_arrival_minutes"
    assert aguaia[wait]["median"] < volume[wait]["median"]
    assert aguaia["critical_demand_gallons"] == 15000
    assert report["aguaia_vs"]["volumen"]["critical_coverage_pp"] >= 0


def test_compare_is_deterministic_and_reports_ties():
    demands, _ = build_demands(scenario(), COMMUNITIES, LOCATIONS)
    first, second = compare(demands, one_truck()), compare(demands, one_truck())
    assert first == second
    # Every strategy serves both communities, so no gain there must be published, not hidden.
    assert "communities_served" in first["aguaia_vs"]["volumen"]["not_better"]


def test_no_trucks_means_no_delivery_for_anyone():
    demands, _ = build_demands(scenario(), COMMUNITIES, LOCATIONS)
    report = compare(demands, [])
    for values in report["strategies"].values():
        assert values["communities_served"] == 0
        assert values["critical_coverage_pct"] == 0
        assert values["critical_first_arrival_minutes"] == {"median": None, "max": None}


async def approved_report(system, item):
    payload = {
        "community_id": item["community_id"],
        "description": item["description"],
    }
    if item.get("hours_without_water") is not None:
        payload["hours_without_water"] = item["hours_without_water"]
    key, response = await submit(system, payload)
    assert response.status_code == 202
    await system.work()
    d = await details(system, key)
    assert d["status"] == "WAITING_APPROVAL"
    p = d["proposal"]["priority"]
    score = (
        round((p["score_min"] + p["score_max"]) / 2) if p["score_min"] != p["score_max"] else None
    )
    assert (await review(system, key, approved_score=score)).status_code == 202
    await system.work()
    detail = await details(system, key)
    assert detail["status"] == "APPROVED"
    return detail["proposal"]["incident_id"]


async def test_planner_agent_impact_matches_impact_json_for_demo_scenario(system):
    scenario_path = ROOT / "data/demo_scenario.json"
    scenario_data = json.loads(scenario_path.read_text(encoding="utf-8"))
    expected_impact = json.loads((ROOT / "evals/impact.json").read_text(encoding="utf-8"))

    for item in scenario_data["reports"]:
        await approved_report(system, item)

    unavailable = scenario_data.get("planner_config", {}).get("unavailable_trucks", [])
    plan = await planned(system, unavailable_trucks=unavailable)

    assert plan["result"] is not None
    assert "impact" in plan["result"]
    impact = plan["result"]["impact"]
    assert impact is not None

    # AguaIA metrics
    ag = impact["strategies"]["aguaia"]
    exp_ag = expected_impact["strategies"]["aguaia"]
    assert ag["critical_coverage_pct"] == exp_ag["critical_coverage_pct"] == 100.0
    assert (
        ag["critical_first_arrival_minutes"]["median"]
        == exp_ag["critical_first_arrival_minutes"]["median"]
        == 143
    )
    assert ag["communities_served"] == exp_ag["communities_served"] == 6

    # Volumen baseline metrics
    vol = impact["strategies"]["volumen"]
    exp_vol = expected_impact["strategies"]["volumen"]
    assert vol["critical_coverage_pct"] == exp_vol["critical_coverage_pct"] == 100.0
    assert (
        vol["critical_first_arrival_minutes"]["median"]
        == exp_vol["critical_first_arrival_minutes"]["median"]
        == 292
    )
    assert vol["communities_served"] == exp_vol["communities_served"] == 6

    # Comparison metrics (AguaIA vs Volumen)
    # Primera entrega crítica: 292 - 143 = 149 min antes
    ag_wait = ag["critical_first_arrival_minutes"]["median"]
    vol_wait = vol["critical_first_arrival_minutes"]["median"]
    diff_minutes = (vol_wait or 0) - (ag_wait or 0)
    assert diff_minutes == 149

    vs_vol = impact["aguaia_vs"]["volumen"]
    exp_vs_vol = expected_impact["aguaia_vs"]["volumen"]
    assert vs_vol["critical_coverage_pp"] == exp_vs_vol["critical_coverage_pp"] == 0.0
    assert vs_vol["not_better"] == exp_vs_vol["not_better"]

    # Security: endpoint is protected, unauthenticated gets 401
    unauth = await system.client.get("/api/admin/plans/latest")
    assert unauth.status_code == 401

    auth_resp = await system.client.get("/api/admin/plans/latest", headers=AUTH)
    assert auth_resp.status_code == 200
    assert auth_resp.json()["result"]["impact"] == impact
