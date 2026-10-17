from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.agents import CommunicationAgent
from app.models import Notification
from app.worker import process_notifications
from tests.conftest import AUTH
from tests.test_evaluations import approved, decide, planned, submit


@pytest.fixture
def communicator(system):
    return CommunicationAgent(system.db)


async def test_communication_agent_scheduled_and_unserved(system, communicator):
    # 1. Crear incidentes aprobados: un hospital y una fuga (no programable por cisterna)
    hosp_key = await approved(
        system, "crit-hosp-nicolas-solano", "El hospital está sin agua desde hace 18 horas"
    )
    leak_key = await approved(
        system, "crit-esc-stella-sierra", "Fuga de agua por tubería rota en la calle"
    )

    # 2. Generar y aprobar el plan
    plan = await planned(system)
    decide_resp = await decide(system, plan)
    assert decide_resp.status_code == 200
    plan_id = plan["id"]

    # 3. Despachar notificaciones con CommunicationAgent
    notifs = await communicator.generate_notifications(plan_id)
    assert len(notifs) >= 2

    # Verificar aviso para el hospital (SCHEDULED)
    hosp_notif = next(n for n in notifs if n["community_id"] == "crit-hosp-nicolas-solano")
    assert hosp_notif["kind"] == "SCHEDULED"
    assert hosp_notif["arrival"] is not None
    assert "HidroAgente informa" in hosp_notif["text"]
    assert hosp_key in hosp_notif["incident_ids"]

    # Verificar aviso para la fuga (UNSERVED)
    leak_notif = next(n for n in notifs if n["community_id"] == "crit-esc-stella-sierra")
    assert leak_notif["kind"] == "UNSERVED"
    assert leak_notif["arrival"] is None
    assert "Fuga" in leak_notif["text"] or "no fue posible" in leak_notif["text"]
    assert leak_key in leak_notif["incident_ids"]

    # 4. Probar idempotencia: una segunda ejecución no duplica registros
    again = await communicator.generate_notifications(plan_id)
    assert len(again) == len(notifs)
    async with system.db.sessions() as session:
        count = await session.scalar(
            select(func.count()).select_from(Notification).where(Notification.plan_id == plan_id)
        )
        assert count == len(notifs)


async def test_worker_process_notifications_job(system, communicator):
    await approved(
        system, "crit-hosp-nicolas-solano", "El hospital está sin agua desde hace 18 horas"
    )
    plan = await planned(system)
    await decide(system, plan)
    plan_id = plan["id"]

    # El worker detecta el plan aprobado y despacha notificaciones
    processed = await process_notifications(system.db, communicator)
    assert processed is True

    async with system.db.sessions() as session:
        notifs = (
            await session.scalars(select(Notification).where(Notification.plan_id == plan_id))
        ).all()
        assert len(notifs) > 0

    # Segunda pasada retorna False (sin planes pendientes)
    assert await process_notifications(system.db, communicator) is False


async def test_worker_does_not_spin_on_empty_or_failing_plans(system, communicator):
    class Broken(CommunicationAgent):
        async def generate_notifications(self, plan_id):
            raise RuntimeError("fallo simulado")

    # Plan aprobado sin incidentes: sin paradas ni demandas, no genera filas.
    plan = await planned(system)
    assert plan["result"]["routes"] == [] and plan["result"]["unserved"] == []
    await decide(system, plan)
    # Un fallo devuelve False para que el bucle duerma, y el plan sigue pendiente.
    assert await process_notifications(system.db, Broken(system.db)) is False
    assert await process_notifications(system.db, communicator) is True
    assert await process_notifications(system.db, communicator) is False


async def test_public_report_status_security_and_linkage(system, communicator):
    # Enviar reporte en hospital
    key, submit_res = await submit(
        system,
        {
            "community_id": "crit-hosp-nicolas-solano",
            "description": "Estamos sin agua en el hospital desde hace 24 horas",
            "hours_without_water": 24,
        },
    )
    report_id = submit_res.json()["report_id"]

    # Antes de aprobación: estado público muestra estatus pero notice es null
    pub_before = await system.client.get(f"/api/reports/{report_id}/public-status")
    assert pub_before.status_code == 200
    data_before = pub_before.json()
    assert data_before["report_id"] == report_id
    assert data_before["notice"] is None
    # Validar que no expone datos sensibles
    assert "incident_id" not in data_before
    assert "traces" not in data_before
    assert "score" not in data_before
    assert "explanation" not in data_before

    # Procesar reporte y aprobar prioridad
    await system.work()
    await system.client.post(
        f"/api/executions/{key}/resume",
        headers=AUTH,
        json={"decision": "APPROVE", "reason": "Aprobado para demo"},
    )
    await system.work()

    # Generar y aprobar plan
    plan = await planned(system)
    await decide(system, plan)
    await process_notifications(system.db, communicator)

    # Ahora el estado público debe enlazar la hora estimada del aviso
    pub_after = await system.client.get(f"/api/reports/{report_id}/public-status")
    assert pub_after.status_code == 200
    data_after = pub_after.json()
    assert data_after["incident_status"] == "SCHEDULED"
    assert data_after["notice"] is not None
    assert data_after["notice"]["kind"] == "SCHEDULED"
    assert data_after["notice"]["arrival"] is not None
    assert "HidroAgente informa" in data_after["notice"]["text"]

    # Test 404 con ID inexistente
    fake_id = str(uuid4())
    assert (await system.client.get(f"/api/reports/{fake_id}/public-status")).status_code == 404


async def test_incident_timeline_endpoint(system, communicator):
    # Crear reporte en hospital
    key, submit_res = await submit(
        system,
        {
            "community_id": "crit-hosp-nicolas-solano",
            "description": "Corte de agua en el hospital Nicolás A. Solano desde hace 24 horas",
            "hours_without_water": 24,
        },
    )
    await system.work()

    # Obtener incident_id
    detail_res = await system.client.get(f"/api/admin/executions/{key}", headers=AUTH)
    incident_id = detail_res.json()["proposal"]["incident_id"]

    # 401 si no hay token
    unauth = await system.client.get(f"/api/admin/incidents/{incident_id}/timeline")
    assert unauth.status_code == 401

    # Aprobar reporte, generar plan y notificaciones
    await system.client.post(
        f"/api/executions/{key}/resume",
        headers=AUTH,
        json={"decision": "APPROVE", "reason": "Aprobado"},
    )
    await system.work()
    plan = await planned(system)
    await decide(system, plan)
    await process_notifications(system.db, communicator)

    # Consultar línea de tiempo protegida
    timeline_res = await system.client.get(
        f"/api/admin/incidents/{incident_id}/timeline", headers=AUTH
    )
    assert timeline_res.status_code == 200
    timeline = timeline_res.json()
    assert len(timeline) >= 4

    sources = [item["source"] for item in timeline]
    assert "report" in sources
    assert "trace" in sources
    assert "review" in sources
    assert "plan" in sources
    assert "notification" in sources
