"""Impact of AguaIA's prioritization versus naive baselines: pure code, no LLM, no database.

The same `plan_distribution` solver runs three times over the same demands and fleet; only the
order changes. Baselines get unique ranks so the solver's tie-break (critical first) never helps
or hurts them.
"""

from dataclasses import dataclass
from statistics import median

from app.contracts import PlanDemand, PlannerPolicyConfig, PlanResult, PlanTruck
from app.domain import calculate_priority, is_critical_location, resolve_criticality
from app.grounding import critical_evidence, stated_hours
from app.planner import minutes, plan_distribution

STRATEGIES = {
    "aguaia": "Puntaje aprobado por el coordinador (punto medio del rango propuesto)",
    "volumen": "Más reportes primero; a igual número, el que reportó antes",
    "llegada": "Orden de llegada del primer reporte de cada comunidad",
}


@dataclass(frozen=True)
class ScenarioReport:
    order: int
    community_id: str
    description: str
    hours_without_water: float | None
    kind: str


@dataclass(frozen=True)
class Demand:
    plan: PlanDemand
    reports: int
    first_report: int


def report_score(report: ScenarioReport, community: dict | None, location: dict | None) -> int:
    """Same rules as ingest + coordinate; the coordinator approves the range midpoint."""
    observed = stated_hours(report.description)
    form = report.hours_without_water
    contradiction = len(set(observed)) > 1 or (
        form is not None and observed and any(h != form for h in observed)
    )
    hours = None if contradiction or any(h > 2160 for h in observed) else form
    critical, _ = resolve_criticality(
        critical_evidence(report.description),
        location is not None,
        is_critical_location(location) if location else None,
    )
    community = community or {}
    priority = calculate_priority(
        hours, critical, community.get("vulnerability"), community.get("population")
    )
    return (priority.score_min + priority.score_max) // 2


def build_demands(
    reports: list[ScenarioReport], communities: dict[str, dict], locations: dict[str, dict]
) -> tuple[list[Demand], dict[str, str]]:
    """Group reports by community like PlannerAgent; returns demands and skipped reasons."""
    by_community: dict[str, list[ScenarioReport]] = {}
    for report in sorted(reports, key=lambda r: r.order):
        by_community.setdefault(report.community_id, []).append(report)
    demands, skipped = [], {}
    for community_id, group in sorted(by_community.items()):
        water = [r for r in group if r.kind != "LEAK"]
        location = locations.get(community_id)
        if not water:
            skipped[community_id] = "FUGA_REQUIERE_REPARACION"
        elif location is None:
            skipped[community_id] = "SIN_UBICACION"
        elif not location.get("estimated_daily_demand_gallons"):
            skipped[community_id] = "SIN_DEMANDA_ESTIMADA"
        else:
            community = communities.get(community_id)
            plan = PlanDemand(
                community_id=community_id,
                name=location["name"],
                incident_ids=[community_id],
                score=max(report_score(r, community, location) for r in water),
                critical=is_critical_location(location),
                lat=location["lat"],
                lng=location["lng"],
                gallons=location["estimated_daily_demand_gallons"],
                max_truck_capacity=location["road_access"]["max_tanker_capacity_gallons"],
            )
            demands.append(Demand(plan, len(water), water[0].order))
    return demands, skipped


def trucks_from_catalog(
    fleet: list[dict], locations: dict[str, dict], unavailable: set[str]
) -> list[PlanTruck]:
    return [
        PlanTruck(
            id=t["id"],
            name=t["name"],
            capacity=t["capacity_gallons"],
            base_id=t["base_plant_id"],
            base_name=locations[t["base_plant_id"]]["name"],
            base_lat=locations[t["base_plant_id"]]["lat"],
            base_lng=locations[t["base_plant_id"]]["lng"],
            shift_start=t["shift_start"],
            shift_end=t["shift_end"],
            flow_gpm=t["discharge_flow_rate_gpm"],
            refill_minutes=t["refill_time_minutes"],
            setup_minutes=t["setup_and_coupling_time_minutes"],
            km_per_gallon=t["fuel_consumption_km_per_gal"],
        )
        for t in fleet
        if t["id"] not in unavailable and t["status"] == "disponible"
    ]


def ordered_demands(demands: list[Demand], strategy: str) -> list[PlanDemand]:
    if strategy == "aguaia":
        return [d.plan for d in demands]
    if len(demands) > 101:
        raise ValueError("Los baselines asignan rangos únicos de 100 a 0")
    key = {
        "volumen": lambda d: (-d.reports, d.first_report),
        "llegada": lambda d: (d.first_report,),
    }[strategy]
    ranked = sorted(demands, key=key)
    return [
        d.plan.model_copy(update={"score": 100 - rank, "critical": False})
        for rank, d in enumerate(ranked)
    ]


def metrics(demands: list[Demand], result: PlanResult, trucks: list[PlanTruck]) -> dict:
    start = min(minutes(t.shift_start) for t in trucks) if trucks else 0
    delivered: dict[str, int] = {}
    first: dict[str, int] = {}
    for route in result.routes:
        for stop in route.stops:
            delivered[stop.community_id] = delivered.get(stop.community_id, 0) + stop.gallons
            arrival = minutes(stop.arrival) - start
            first[stop.community_id] = min(first.get(stop.community_id, arrival), arrival)
    critical = [d.plan for d in demands if d.plan.critical]
    critical_demand = sum(d.gallons for d in critical)
    critical_planned = sum(delivered.get(d.community_id, 0) for d in critical)
    waits = sorted(first[d.community_id] for d in critical if d.community_id in first)
    return {
        "critical_coverage_pct": (
            round(100 * critical_planned / critical_demand, 1) if critical_demand else None
        ),
        "critical_planned_gallons": critical_planned,
        "critical_demand_gallons": critical_demand,
        "critical_first_arrival_minutes": {
            "median": median(waits) if waits else None,
            "max": waits[-1] if waits else None,
        },
        "critical_without_delivery": sorted(
            d.community_id for d in critical if d.community_id not in delivered
        ),
        "communities_served": len(delivered),
        "communities_total": len(demands),
        "planned_gallons": result.planned_gallons,
        "demand_gallons": result.demand_gallons,
        "without_delivery": sorted(
            d.plan.community_id for d in demands if d.plan.community_id not in delivered
        ),
    }


def not_better(aguaia: dict, baseline: dict) -> list[str]:
    """Metrics where AguaIA does not strictly beat the baseline; published, never hidden."""
    found = []
    if (aguaia["critical_coverage_pct"] or 0) <= (baseline["critical_coverage_pct"] or 0):
        found.append("critical_coverage_pct")
    ours = aguaia["critical_first_arrival_minutes"]["median"]
    theirs = baseline["critical_first_arrival_minutes"]["median"]
    if ours is None or (theirs is not None and ours >= theirs):
        found.append("critical_first_arrival_minutes.median")
    if aguaia["communities_served"] <= baseline["communities_served"]:
        found.append("communities_served")
    return found


def compare(
    demands: list[Demand], trucks: list[PlanTruck], policy: PlannerPolicyConfig | None = None
) -> dict:
    results = {}
    for strategy, description in STRATEGIES.items():
        ordered = ordered_demands(demands, strategy)
        plan = plan_distribution(ordered, trucks, policy)
        # Same sort key as plan_distribution, so this is the order the solver attended.
        attended = sorted(ordered, key=lambda d: (-d.score, not d.critical, d.community_id))
        results[strategy] = {
            "description": description,
            "order": [d.community_id for d in attended],
            **metrics(demands, plan, trucks),
        }
    results_vs = {
        name: {
            "critical_coverage_pp": round(
                (results["aguaia"]["critical_coverage_pct"] or 0)
                - (results[name]["critical_coverage_pct"] or 0),
                1,
            ),
            "not_better": not_better(results["aguaia"], results[name]),
        }
        for name in ("volumen", "llegada")
    }
    return {"strategies": results, "aguaia_vs": results_vs}
