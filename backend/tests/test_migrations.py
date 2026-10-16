import os
import subprocess
import sys
from pathlib import Path


def test_migrations_seed_and_schema_match(tmp_path):
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path}/migrations.sqlite",
        "CHECKPOINT_PATH": str(tmp_path / "checkpoints.sqlite"),
    }
    directory = Path(__file__).parents[1]
    for command in (
        ["alembic", "upgrade", "head"],
        ["app.seed"],
        ["app.seed"],
        ["alembic", "check"],
        ["alembic", "downgrade", "base"],
        ["alembic", "upgrade", "head"],
    ):
        subprocess.run(
            [sys.executable, "-m", *command],
            cwd=directory,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
