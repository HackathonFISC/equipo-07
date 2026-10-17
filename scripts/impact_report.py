"""Compare AguaIA's plan with naive baselines on a declared scenario; run with backend Python.

Usage (from backend/): uv run python ../scripts/impact_report.py [scenario.json]
Writes evals/impact.json. Same scenario and data give byte-identical output (no timestamps).
"""

import asyncio
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.impact import ScenarioReport, build_demands, compare, trucks_from_catalog  # noqa: E402
from app.providers import MockLLMProvider  # noqa: E402
from app.services import fleet_catalog, location_catalog  # noqa: E402

ASSUMPTIONS = [
    "El tipo de incidencia se clasifica con el proveedor determinístico (mock); "
    "no es inferencia de un LLM.",
    "El coordinador aprueba el punto medio del rango propuesto (valor por defecto de la UI).",
    "Los baselines usan el mismo planificador, flota y demandas; solo cambia el orden.",
    "Tiempos medidos desde el inicio del primer turno; distancias en línea recta × tortuosidad "
    "a velocidad fija (supuesto de planificación, no tráfico real).",
    "Las comunidades sin coordenadas, sin demanda estimada o con solo fugas quedan fuera "
    "de las tres estrategias por igual.",
]


async def scenario_reports(scenario: dict) -> list[ScenarioReport]:
    provider = MockLLMProvider()
    reports = []
    for item in scenario["reports"]:
        normalized = await provider.extract_report(item["description"])
        reports.append(
            ScenarioReport(
                order=item["index"],
                community_id=item["community_id"],
                description=item["description"],
                hours_without_water=item.get("hours_without_water"),
                kind=normalized.kind,
            )
        )
    return reports


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/demo_scenario.json"
    raw = path.read_bytes()
    scenario = json.loads(raw)
    communities = {
        c["id"]: c for c in json.loads((ROOT / "data/communities.json").read_text("utf-8"))
    }
    locations = location_catalog()
    unavailable = set(scenario.get("planner_config", {}).get("unavailable_trucks", []))
    reports = asyncio.run(scenario_reports(scenario))
    demands, skipped = build_demands(reports, communities, locations)
    trucks = trucks_from_catalog(fleet_catalog(), locations, unavailable)
    report = {
        "scenario": {
            "file": path.name,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "reports": len(reports),
            "unavailable_trucks": sorted(unavailable),
            "excluded": skipped,
        },
        "assumptions": ASSUMPTIONS,
        **compare(demands, trucks),
    }
    output = ROOT / "evals/impact.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    for name, v in report["strategies"].items():
        wait = v["critical_first_arrival_minutes"]["median"]
        served = f"{v['communities_served']}/{v['communities_total']}"
        print(
            f"{name}: cobertura crítica {v['critical_coverage_pct']}%, mediana {wait} min, {served}"
        )
    for name, delta in report["aguaia_vs"].items():
        print(f"vs {name}: {delta['critical_coverage_pp']:+} pp; no mejora: {delta['not_better']}")


if __name__ == "__main__":
    main()
