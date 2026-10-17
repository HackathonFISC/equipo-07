from datetime import timedelta
from uuid import uuid4

from app import geo
from app.models import Association, Incident, Report, now
from app.services import location_catalog
from tests.conftest import AUTH
from tests.test_evaluations import approved, decide, planned

BALBOA = "corr-la-chorrera-barrio-balboa"


async def seed_activity(system):
    """Rows written directly so each count below is known in advance."""
    async with system.db.sessions.begin() as session:

        def incident(community_id, status="OPEN"):
            row = Incident(id=str(uuid4()), community_id=community_id, kind="OUTAGE", summary="x")
            row.status = status
            session.add(row)
            return row

        async def report(community_id, incident=None, link="CONFIRMED", age_days=0):
            key = str(uuid4())
            session.add(
                Report(
                    id=key,
                    community_id=community_id,
                    description="Sin agua en el sector",
                    payload_hash=key,
                    created_at=now() - timedelta(days=age_days),
                )
            )
            if incident:
                await session.flush()  # no ORM relationship orders the inserts
                session.add(
                    Association(
                        report_id=key,
                        incident_id=incident.id,
                        status=link,
                        reasoning="prueba",
                        confidence="HIGH",
                    )
                )

        a, b = incident(BALBOA), incident(BALBOA, "SCHEDULED")
        hospital = incident("crit-hosp-nicolas-solano")
        old = incident("corr-capira-caimito")
        await session.flush()
        await report(BALBOA, a)
        await report(BALBOA, a)  # duplicate of the same incident
        await report(BALBOA, b)
        await report(BALBOA, a, link="REJECTED")
        await report(BALBOA)  # still being analysed: no incident yet
        await report("crit-hosp-nicolas-solano", hospital)
        await report("arraijan-demo")
        await report("corr-capira-caimito", old, age_days=10)


async def activity(system, query=""):
    response = await system.client.get(f"/api/admin/map/activity{query}", headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()
    return body, {c["id"]: c for c in body["corregimientos"]}


async def test_activity_counts_reports_and_distinct_incidents(system):
    await seed_activity(system)
    body, areas = await activity(system)
    balboa = areas[BALBOA]
    # 5 reports, 2 incidents: the duplicate, the rejected link and the pending report add none.
    assert (balboa["reports"], balboa["incidents"], balboa["catalog_point_reports"]) == (5, 2, 0)
    # The hospital is a catalog place that the locations layer assigns to Playa Leona.
    leona = areas["corr-la-chorrera-playa-leona"]
    assert (leona["reports"], leona["incidents"], leona["catalog_point_reports"]) == (1, 1, 1)
    assert areas["corr-chame-bejuco"] | {"reports": 0} == areas["corr-chame-bejuco"]
    assert areas["corr-chame-bejuco"]["geometry"] == "COD_AB"
    assert areas["corr-arraijan-burunga"]["geometry"] == "SIN_GEOMETRIA"
    assert body["unassigned"] == {"reports": 1, "incidents": 0, "community_ids": ["arraijan-demo"]}
    assert (body["reports"], body["incidents"]) == (8, 4)
    assert len(areas) == 60
    assert body["corregimientos"][0]["id"] == BALBOA  # most reports first


async def test_activity_filters_by_period_and_incident_status(system):
    await seed_activity(system)
    _, all_time = await activity(system)
    _, week = await activity(system, "?days=7")
    assert all_time["corr-capira-caimito"]["reports"] == 1
    assert week["corr-capira-caimito"]["reports"] == 0
    body, scheduled = await activity(system, "?status=SCHEDULED")
    assert (scheduled[BALBOA]["reports"], scheduled[BALBOA]["incidents"]) == (1, 1)
    assert (body["reports"], body["unassigned"]["reports"]) == (1, 0)


async def test_map_endpoints_require_the_coordinator_token(system):
    for path in ("/api/admin/map/activity", "/api/admin/map/boundaries", "/api/admin/plans"):
        assert (await system.client.get(path)).status_code == 401
    bad = await system.client.get("/api/admin/map/activity?status=DELIVERED", headers=AUTH)
    assert bad.status_code == 422
    missing = await system.client.get(f"/api/admin/map/plans/{uuid4()}", headers=AUTH)
    assert missing.status_code == 404


async def test_boundaries_match_the_inec_catalog_and_every_place_has_a_corregimiento(system):
    response = await system.client.get("/api/admin/map/boundaries", headers=AUTH)
    ids = [f["properties"]["id"] for f in response.json()["features"]]
    assert len(ids) == len(set(ids)) == 57
    assert set(ids) <= set(geo.corregimientos())
    locations = location_catalog()
    assert all(geo.corregimiento_of(pid, locations) for pid in locations)


async def test_plan_map_separates_assignment_order_and_missing_locations(system):
    await approved(
        system, "crit-hosp-nicolas-solano", "El hospital está sin agua desde hace 18 horas"
    )
    await approved(system, BALBOA, "No hay agua en la casa desde hace 20 horas")
    plan = await planned(system, unavailable_trucks=["cisterna-burunga-01"])

    response = await system.client.get(f"/api/admin/map/plans/{plan['id']}", headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "PROPOSED"
    assert body["road_routing"] == "NO_CALCULADA"
    assert body["excluded_trucks"] == ["cisterna-burunga-01"]
    assert "cisterna-burunga-01" not in {r["truck_id"] for r in body["routes"]}
    stops = [s for r in body["routes"] for s in r["stops"]]
    assert stops and all(s["place"]["location"] == "ESTIMADA" for s in stops)
    assert all(r["depot"]["location"] == "ESTIMADA" for r in body["routes"])
    for route in body["routes"]:
        assert [s["order"] for s in route["stops"]] == list(range(1, len(route["stops"]) + 1))
    # A corregimiento has no point in the catalog: no coordinates, but its area is known.
    balboa = next(u for u in body["unserved"] if u["place"]["id"] == BALBOA)
    assert balboa["reason"] == "SIN_UBICACION"
    assert balboa["place"] | {"lat": None, "lng": None} == balboa["place"]
    assert balboa["place"]["corregimiento_id"] == BALBOA

    assert (await decide(system, plan)).status_code == 200
    approved_map = await system.client.get(f"/api/admin/map/plans/{plan['id']}", headers=AUTH)
    assert approved_map.json()["status"] == "APPROVED"
    listed = (await system.client.get("/api/admin/plans", headers=AUTH)).json()
    assert listed[0]["id"] == plan["id"] and listed[0]["status"] == "APPROVED"
    assert listed[0]["planned_gallons"] == plan["result"]["planned_gallons"]
