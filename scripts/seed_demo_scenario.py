#!/usr/bin/env python3
"""
scripts/seed_demo_scenario.py
Poblador reproducible del escenario de demostración oficial para AguaIA.

Utiliza la API HTTP pública (POST /api/reports) con Idempotency-Key determinística.
No inserta registros directamente en la base de datos para garantizar la validez
de los contratos, rate limits y trazabilidad.
"""

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

import httpx

SCENARIO_NAMESPACE = uuid.UUID("3a5e8f1b-4d2c-4e89-9a1f-8c7b6d5e4f3a")


def load_scenario(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"No se encontró el archivo de escenario: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def submit_scenario(base_url: str, scenario_data: dict) -> list[dict]:
    reports = scenario_data.get("reports", [])
    print(f"\n--- Iniciando envío de escenario demo: {len(reports)} reportes ---")
    print(f"Destino: {base_url}/api/reports")
    
    results = []
    with httpx.Client(base_url=base_url, timeout=15.0) as client:
        for item in reports:
            idx = item.get("index", len(results) + 1)
            community_id = item["community_id"]
            desc = item["description"]
            hours = item.get("hours_without_water")
            
            # Idempotency-Key determinística por índice de escenario
            key = str(uuid.uuid5(SCENARIO_NAMESPACE, f"demo-report-{idx}"))
            payload = {
                "community_id": community_id,
                "description": desc,
                "hours_without_water": hours,
            }
            
            max_attempts = 4
            delay = 2.2
            for attempt in range(1, max_attempts + 1):
                try:
                    response = client.post(
                        "/api/reports",
                        json=payload,
                        headers={"Idempotency-Key": key},
                    )
                    if response.status_code == 202:
                        receipt = response.json()
                        print(f"  [OK] #{idx:02d} [{community_id}] -> Report ID: {receipt['report_id']} ({receipt['status']})")
                        results.append({
                            "index": idx,
                            "community_id": community_id,
                            "report_id": receipt["report_id"],
                            "thread_id": receipt["thread_id"],
                            "status": receipt["status"],
                        })
                        break
                    elif response.status_code == 429:
                        wait_sec = float(response.headers.get("Retry-After", 5))
                        print(f"  [WAIT] Rate-limit alcanzado (429). Esperando {wait_sec}s antes de reintentar...")
                        time.sleep(wait_sec)
                    else:
                        print(f"  [ERROR] #{idx:02d} Respuesta inesperada {response.status_code}: {response.text}")
                        break
                except httpx.RequestError as exc:
                    print(f"  [WARN] Error de conexión en #{idx:02d} (intento {attempt}/{max_attempts}): {exc}")
                    if attempt == max_attempts:
                        raise
                    time.sleep(delay * attempt)
            
            # Espaciado preventivo para rate limit (<30 req/min)
            time.sleep(2.1)

    print(f"\n[COMPLETADO] Se enviaron {len(results)}/{len(reports)} reportes exitosamente.")
    return results


def main():
    parser = argparse.ArgumentParser(description="Poblar escenario demo oficial en AguaIA")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="URL base de la API FastAPI (defecto: http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--scenario-file",
        default="data/demo_scenario.json",
        help="Ruta relativa o absoluta al JSON del escenario",
    )
    args = parser.parse_args()

    scenario_path = Path(args.scenario_file)
    if not scenario_path.is_absolute():
        scenario_path = Path(__file__).resolve().parent.parent / scenario_path

    try:
        scenario_data = load_scenario(scenario_path)
        submit_scenario(args.base_url, scenario_data)
    except Exception as exc:
        print(f"\n[FATAL] Error ejecutando seed_demo_scenario: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
