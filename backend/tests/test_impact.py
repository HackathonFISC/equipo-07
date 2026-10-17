from app.impact import ScenarioReport, build_demands, compare, ordered_demands, trucks_from_catalog
from app.services import fleet_catalog, location_catalog

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
