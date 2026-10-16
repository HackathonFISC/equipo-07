import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx

from tests.conftest import AUTH, TOKEN
from tests.test_evaluations import BASE


def test_real_http_queue_and_worker_restart(tmp_path):
    directory = Path(__file__).parents[1]
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path}/http.sqlite",
        "CHECKPOINT_PATH": str(tmp_path / "checkpoints.sqlite"),
        "COORDINATOR_TOKEN": TOKEN,
        "LLM_PROVIDER": "mock",
    }
    for module in (["alembic", "upgrade", "head"], ["app.seed"]):
        subprocess.run(
            [sys.executable, "-m", *module], cwd=directory, env=env, check=True, capture_output=True
        )
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        port = port_socket.getsockname()[1]

    def start(module):
        return subprocess.Popen(
            [sys.executable, "-m", *module],
            cwd=directory,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )

    def wait_until(check):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                if check():
                    return
            except httpx.ConnectError:
                pass
            time.sleep(0.1)
        raise AssertionError("El proceso no alcanzó el estado esperado en 15 segundos")

    processes = []
    try:
        api = start(["uvicorn", "app.api:app", "--host", "127.0.0.1", "--port", str(port)])
        processes.append(api)
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=3) as client:
            wait_until(lambda: client.get("/api/health").status_code == 200)
            key = str(uuid4())
            result = client.post("/api/reports", json=BASE, headers={"Idempotency-Key": key})
            assert result.status_code == 202 and result.json()["status"] == "QUEUED"
            assert (
                client.get(f"/api/admin/executions/{key}", headers=AUTH).json()["proposal"] is None
            )
            worker = start(["app.worker"])
            processes.append(worker)

            def status():
                return client.get(f"/api/executions/{key}").json()["status"]

            wait_until(lambda: status() == "WAITING_APPROVAL")
            worker.kill()
            worker.wait(timeout=5)
            decision = client.post(
                f"/api/executions/{key}/resume",
                headers=AUTH,
                json={"decision": "APPROVE", "reason": "Verificado por HTTP"},
            )
            assert decision.status_code == 202
            assert status() == "RESUME_QUEUED"
            processes.append(start(["app.worker"]))
            wait_until(lambda: status() == "APPROVED")
            result = client.get(f"/api/admin/executions/{key}", headers=AUTH).json()
            assert result["review"]["applied_at"]
            assert result["proposal"]["final_score"] == result["proposal"]["priority"]["score_min"]
            assert len([e for e in result["traces"] if e["event"] == "DECISION_APPLIED"]) == 1
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
