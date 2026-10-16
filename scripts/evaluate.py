"""Run actual evals and write machine-readable results; execute with backend Python."""

import json
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="aguaia-evals-") as directory:
        output = Path(directory) / "results.xml"
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                "tests/test_evaluations.py",
                "-q",
                "-p",
                "no:cacheprovider",
                f"--junitxml={output}",
            ],
            cwd=ROOT / "backend",
            check=False,
        )
        if not output.exists():
            raise SystemExit(result.returncode or 1)
        cases = []
        for item in ET.parse(output).iter("testcase"):
            cases.append(
                {
                    "id": item.attrib["name"].split("[")[-1].rstrip("]"),
                    "passed": not any(
                        item.find(tag) is not None for tag in ("failure", "error", "skipped")
                    ),
                    "seconds": float(item.attrib["time"]),
                }
            )
        (ROOT / "evals/results.xml").write_bytes(output.read_bytes())
    passed = sum(c["passed"] for c in cases)
    groups = {
        "consolidation_scenarios": ["E05", "E06", "E07", "E18", "E20", "E22"],
        "guardrail_scenarios": ["E03", "E10", "E11", "E12", "E16", "E20", "E21"],
        "human_decision_scenarios": ["E01", "E14", "E15", "E17", "E18", "E19"],
    }
    metrics = {
        name: {"passed": sum(c["passed"] for c in cases if c["id"] in ids), "total": len(ids)}
        for name, ids in groups.items()
    }
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": "mock-deterministic",
        "passed": passed,
        "total": len(cases),
        "scenario_pass_rate": passed / len(cases) if cases else 0,
        "metrics": metrics,
        "pytest_exit_code": result.returncode,
        "cases": cases,
        "note": "Contract/scenario assertions, not real-model accuracy",
    }
    (ROOT / "evals/results.json").write_text(json.dumps(report, indent=2) + "\n", "utf-8")
    print(json.dumps(report, indent=2))
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
