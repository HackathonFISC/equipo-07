import random

from app.contracts import PlanDemand, PlanTruck
from app.planner import minutes, plan_distribution

PLANT = (8.8917, -79.7875)


def demand(cid, score, gallons=2000, max_cap=10000, critical=False, offset=0.01):
    return PlanDemand(
        community_id=cid,
        name=cid,
        incident_ids=[f"inc-{cid}"],
        score=score,
        critical=critical,
        lat=PLANT[0] + offset,
        lng=PLANT[1] + offset,
        gallons=gallons,
        max_truck_capacity=max_cap,
    )


def truck(tid, capacity=3000, start="06:00", end="14:00"):
    return PlanTruck(
        id=tid,
        name=tid,
        capacity=capacity,
        base_id="pot-trapichito",
        base_name="Planta",
        base_lat=PLANT[0],
        base_lng=PLANT[1],
        shift_start=start,
        shift_end=end,
        flow_gpm=150,
        refill_minutes=20,
        setup_minutes=10,
        km_per_gallon=6,
    )


def stops(result):
    return [s for r in result.routes for s in r.stops]


def test_same_inputs_in_any_order_give_the_same_plan():
    demands = [demand(f"c{i}", 40 + i, offset=0.005 * i) for i in range(6)]
    trucks = [truck("a"), truck("b", 10000)]
    expected = plan_distribution(demands, trucks)
    shuffled_demands, shuffled_trucks = demands[:], trucks[:]
    random.Random(7).shuffle(shuffled_demands)
    random.Random(7).shuffle(shuffled_trucks)
    assert plan_distribution(shuffled_demands, shuffled_trucks) == expected


def test_higher_score_is_served_first():
    result = plan_distribution([demand("low", 30), demand("high", 90)], [truck("a")])
    order = [s.community_id for s in result.routes[0].stops]
    assert order == ["high", "low"]


def test_every_demand_gets_a_first_load_before_any_second_load():
    result = plan_distribution(
        [demand("big", 90, gallons=9000), demand("small", 20, gallons=3000)], [truck("a")]
    )
    order = [s.community_id for s in result.routes[0].stops]
    assert order[:2] == ["big", "small"]
    assert "primera carga" in result.routes[0].stops[1].reason


def test_road_access_limits_truck_size():
    result = plan_distribution([demand("hill", 80, max_cap=3000)], [truck("big", 10000)])
    assert not result.routes
    assert result.unserved[0].reason == "SIN_CISTERNA_COMPATIBLE"


def test_trucks_must_return_before_shift_end():
    far = demand("far", 80, offset=0.4)
    result = plan_distribution([far], [truck("short", start="06:00", end="06:30")])
    assert result.unserved[0].reason == "SIN_TIEMPO_EN_TURNO"
    plan = plan_distribution(
        [demand(f"c{i}", 50, gallons=3000, offset=0.02 * i) for i in range(1, 12)], [truck("a")]
    )
    route = plan.routes[0]
    assert minutes(route.ends_at) <= minutes("14:00")
    assert plan.unserved and plan.planned_gallons < plan.demand_gallons


def test_truck_refills_and_combines_small_deliveries():
    result = plan_distribution(
        [demand("a", 90, gallons=1000), demand("b", 80, gallons=1500), demand("c", 70)],
        [truck("t", 3000)],
    )
    trips = [s.trip for s in result.routes[0].stops]
    assert trips == [1, 1, 2]
    assert result.planned_gallons == result.demand_gallons == 4500
