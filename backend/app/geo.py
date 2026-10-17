"""Map data: INEC corregimientos, their COD-AB boundaries and where plan places are. No DB."""

import json
from functools import cache
from pathlib import Path

from app.contracts import plain

DATA = Path(__file__).resolve().parents[2] / "data"


@cache
def boundaries() -> dict:
    return json.loads((DATA / "panama_oeste_corregimientos.geojson").read_text("utf-8"))


def _key(district: str, name: str) -> tuple[str, str]:
    # «Arraiján (cabecera)» in the INEC catalog is «Arraiján Cabecera» in the locations layer.
    return plain(district), " ".join(plain(name).replace("(", "").replace(")", "").split())


@cache
def corregimientos() -> dict[str, dict]:
    catalog = json.loads((DATA / "panama_oeste_corregimientos.json").read_text("utf-8"))
    shaped = {f["properties"]["id"] for f in boundaries()["features"]}
    return {
        c["id"]: {
            "id": c["id"],
            "name": c["name"],
            "district": d["name"],
            "population": c["population_2023"],
            "geometry": "COD_AB" if c["id"] in shaped else "SIN_GEOMETRIA",
        }
        for d in catalog["districts"]
        for c in d["corregimientos"]
    }


@cache
def _by_name() -> dict[tuple[str, str], str]:
    return {_key(c["district"], c["name"]): c["id"] for c in corregimientos().values()}


def corregimiento_of(community_id: str, locations: dict) -> str | None:
    """A citizen-chosen corregimiento, or the one the locations layer declares for a place."""
    if community_id in corregimientos():
        return community_id
    place = locations.get(community_id)
    if place is None:
        return None
    return _by_name().get(_key(place["district"], place["corregimiento"]))


def place(place_id: str, name: str, locations: dict) -> dict:
    point = locations.get(place_id)
    return {
        "id": place_id,
        "name": point["name"] if point else name,
        "lat": point["lat"] if point else None,
        "lng": point["lng"] if point else None,
        "location": "ESTIMADA" if point else "SIN_UBICACION",
        "corregimiento_id": corregimiento_of(place_id, locations),
    }


def plan_map(plan: dict, fleet: list[dict], locations: dict) -> dict:
    """Assignment and visit order of a stored plan, placed on the map; never a road path."""
    bases = {t["id"]: t["base_plant_id"] for t in fleet}
    result = plan["result"] or {}
    routes = [
        {
            **{
                k: route[k]
                for k in ("truck_id", "truck_name", "capacity", "gallons", "trips", "km", "shift")
            },
            "ends_at": route.get("ends_at"),
            # A truck removed from the fleet file since the plan was made has no known base.
            "depot": place(bases.get(route["truck_id"], ""), route["base_name"], locations),
            "stops": [
                {
                    "order": order,
                    "trip": stop["trip"],
                    "arrival": stop["arrival"],
                    "gallons": stop["gallons"],
                    "incident_ids": stop["incident_ids"],
                    "place": place(stop["community_id"], stop["name"], locations),
                }
                for order, stop in enumerate(route["stops"], start=1)
            ],
        }
        for route in result.get("routes", [])
    ]
    distance = next((line for line in result.get("explanation", []) if "Distancias" in line), None)
    return {
        "plan_id": plan["id"],
        "status": plan["status"],
        "created_at": plan["created_at"],
        "excluded_trucks": plan["request"]["unavailable_trucks"],
        "distance_model": distance,
        "routes": routes,
        "unserved": [
            {
                "reason": u["reason"],
                "gallons_missing": u["gallons_missing"],
                "detail": u["detail"],
                "incident_ids": u["incident_ids"],
                "place": place(u["community_id"], u["name"], locations),
            }
            for u in result.get("unserved", [])
        ],
    }
