"""Deterministic tanker assignment: pure code, no LLM, no database."""

from math import asin, cos, radians, sin, sqrt

from app.contracts import (
    PlanDemand,
    PlannerPolicyConfig,
    PlanResult,
    PlanStop,
    PlanTruck,
    TruckRoute,
    UnservedDemand,
)


def minutes(clock: str) -> int:
    hours, mins = clock.split(":")
    return int(hours) * 60 + int(mins)


def clock(total: float) -> str:
    total = round(total)
    return f"{total // 60 % 24:02d}:{total % 60:02d}"


def road_km(a: tuple[float, float], b: tuple[float, float], policy: PlannerPolicyConfig) -> float:
    lat1, lng1, lat2, lng2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h)) * policy.tortuosity


def plan_distribution(
    demands: list[PlanDemand],
    trucks: list[PlanTruck],
    policy: PlannerPolicyConfig | None = None,
) -> PlanResult:
    """Priority-ordered rounds: every demand gets one load before any demand gets a second.

    Each truck starts loaded at its base plant at shift start, refills at that plant when its
    remaining load cannot cover the next delivery, and must be able to return before shift end.
    Ties are broken by identifiers so the same inputs always give the same plan.
    """
    policy = policy or PlannerPolicyConfig()
    ordered = sorted(demands, key=lambda d: (-d.score, not d.critical, d.community_id))
    fleet = sorted(trucks, key=lambda t: t.id)
    state = {
        t.id: {
            "time": float(minutes(t.shift_start)),
            "pos": (t.base_lat, t.base_lng),
            "load": t.capacity,
            "km": 0.0,
            "trip": 1,
            "stops": [],
        }
        for t in fleet
    }
    remaining = {d.community_id: d.gallons for d in ordered}
    blocked: dict[str, str] = {}

    def simulate(truck: PlanTruck, demand: PlanDemand):
        s = state[truck.id]
        base = (truck.base_lat, truck.base_lng)
        stop = (demand.lat, demand.lng)
        need = min(remaining[demand.community_id], truck.capacity)
        time, pos, load, km, trip = s["time"], s["pos"], s["load"], s["km"], s["trip"]
        if load < need:
            leg = road_km(pos, base, policy)
            time += leg / policy.speed_kmh * 60 + truck.refill_minutes
            km += leg
            pos, load = base, truck.capacity
            trip += 1 if s["stops"] else 0
        leg = road_km(pos, stop, policy)
        arrival = time + leg / policy.speed_kmh * 60
        finish = arrival + truck.setup_minutes + need / truck.flow_gpm
        back = road_km(stop, base, policy) / policy.speed_kmh * 60
        if finish + back > minutes(truck.shift_end):
            return None
        return {
            "time": finish,
            "pos": stop,
            "load": load - need,
            "km": km + leg,
            "trip": trip,
            "arrival": arrival,
            "gallons": need,
        }

    round_number = 0
    progress = True
    while progress:
        progress = False
        round_number += 1
        for demand in ordered:
            if remaining[demand.community_id] <= 0:
                continue
            compatible = [t for t in fleet if t.capacity <= demand.max_truck_capacity]
            if not compatible:
                blocked[demand.community_id] = "SIN_CISTERNA_COMPATIBLE"
                continue
            options = [(simulate(t, demand), t) for t in compatible]
            feasible = [(o, t) for o, t in options if o is not None]
            if not feasible:
                blocked.setdefault(demand.community_id, "SIN_TIEMPO_EN_TURNO")
                continue
            option, truck = min(feasible, key=lambda pair: (pair[0]["time"], pair[1].id))
            kind = "institución crítica" if demand.critical else "sector"
            reason = (
                f"Puntaje {demand.score} ({kind}); "
                + (
                    "primera carga."
                    if round_number == 1
                    else f"carga adicional en la ronda {round_number}."
                )
                + f" {truck.name} es la cisterna compatible que termina esta entrega más temprano."
            )
            stop = PlanStop(
                community_id=demand.community_id,
                name=demand.name,
                incident_ids=demand.incident_ids,
                trip=option["trip"],
                arrival=clock(option["arrival"]),
                gallons=option["gallons"],
                reason=reason,
            )
            s = state[truck.id]
            s.update({k: option[k] for k in ("time", "pos", "load", "km", "trip")})
            s["stops"].append(stop)
            remaining[demand.community_id] -= option["gallons"]
            progress = True

    routes = []
    for truck in fleet:
        s = state[truck.id]
        if not s["stops"]:
            continue
        back = road_km(s["pos"], (truck.base_lat, truck.base_lng), policy)
        km = s["km"] + back
        routes.append(
            TruckRoute(
                truck_id=truck.id,
                truck_name=truck.name,
                capacity=truck.capacity,
                base_name=truck.base_name,
                shift=f"{truck.shift_start}–{truck.shift_end}",
                trips=s["trip"],
                km=round(km, 1),
                fuel_gallons=round(km / truck.km_per_gallon, 1),
                gallons=sum(stop.gallons for stop in s["stops"]),
                ends_at=clock(s["time"] + back / policy.speed_kmh * 60),
                stops=s["stops"],
            )
        )

    unserved = []
    for demand in ordered:
        missing = remaining[demand.community_id]
        if missing <= 0:
            continue
        served = demand.gallons - missing
        reason = (
            "COBERTURA_PARCIAL"
            if served
            else blocked.get(demand.community_id, "SIN_TIEMPO_EN_TURNO")
        )
        detail = {
            "COBERTURA_PARCIAL": f"Recibe {served} de {demand.gallons} galones; "
            "no queda tiempo de turno para más viajes.",
            "SIN_CISTERNA_COMPATIBLE": f"El acceso vial admite cisternas de hasta "
            f"{demand.max_truck_capacity} galones y ninguna disponible cabe.",
            "SIN_TIEMPO_EN_TURNO": "Ninguna cisterna compatible puede ir y volver "
            "dentro de su turno.",
        }[reason]
        unserved.append(
            UnservedDemand(
                community_id=demand.community_id,
                name=demand.name,
                incident_ids=demand.incident_ids,
                reason=reason,
                gallons_missing=missing,
                detail=detail,
            )
        )

    planned = sum(route.gallons for route in routes)
    total = sum(d.gallons for d in ordered)
    explanation = [
        "Orden de atención: mayor puntaje aprobado por el coordinador primero; "
        "a igual puntaje, instituciones críticas.",
        "Equidad: cada comunidad recibe una primera carga antes de que otra reciba una segunda.",
        "Restricciones: capacidad de cada cisterna, capacidad máxima admitida por el acceso "
        "vial, turno del conductor con regreso a planta y recarga en la planta base.",
        f"Distancias: línea recta × {policy.tortuosity} a {policy.speed_kmh:g} km/h "
        "(supuesto de planificación, no tráfico real).",
    ]
    return PlanResult(
        policy_version=policy.version,
        routes=routes,
        unserved=unserved,
        demand_gallons=total,
        planned_gallons=planned,
        explanation=explanation,
    )
