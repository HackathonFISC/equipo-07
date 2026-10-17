import os
import sqlite3
import subprocess
import sys
from contextlib import closing
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


def test_duration_migration_preserves_existing_report(tmp_path):
    path = tmp_path / "legacy.sqlite"
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{path}",
        "CHECKPOINT_PATH": str(tmp_path / "checkpoints.sqlite"),
    }
    directory = Path(__file__).parents[1]
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "d2b6f8a4c1e7"],
        cwd=directory,
        env=env,
        check=True,
        capture_output=True,
    )
    with closing(sqlite3.connect(path)) as connection:
        connection.execute(
            "INSERT INTO communities (id,name,district,is_synthetic) "
            "VALUES ('legacy','Sector sintético','Demo',1)"
        )
        connection.execute(
            "INSERT INTO reports "
            "(id,community_id,description,hours_without_water,payload_hash,created_at) "
            "VALUES ('report','legacy','Sin agua en el sector',6,'old-hash','2026-10-17')"
        )
        connection.commit()
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=directory,
        env=env,
        check=True,
        capture_output=True,
    )
    with closing(sqlite3.connect(path)) as connection:
        row = connection.execute(
            "SELECT hours_without_water,duration_bucket,payload_hash FROM reports"
        ).fetchone()
    assert row == (6.0, None, "old-hash")
