import asyncio
import json
from pathlib import Path

from app.config import Settings
from app.db import Database
from app.models import Community

COMMUNITIES = Path(__file__).parents[2] / "data/communities.json"

CORREGIMIENTOS = Path(__file__).parents[2] / "data/panama_oeste_corregimientos.json"


def load(path: Path) -> list[dict]:
    return json.loads(path.read_text("utf-8"))


def corregimiento_rows(path: Path = CORREGIMIENTOS) -> list[dict]:
    """INEC 2023 corregimientos: the catalog the citizen chatbot offers, without coordinates."""
    catalog = json.loads(path.read_text("utf-8"))
    return [
        {
            "id": corregimiento["id"],
            "name": corregimiento["name"],
            "district": district["name"],
            "population": corregimiento["population_2023"],
            "vulnerability": None,
            "is_synthetic": False,
        }
        for district in catalog["districts"]
        for corregimiento in district["corregimientos"]
    ]


async def seed(db, path: Path = COMMUNITIES):
    """Upsert: the JSON is the source of truth, so edits reach databases that already exist."""
    values = load(path) + corregimiento_rows()
    async with db.sessions.begin() as session:
        for item in values:
            await session.merge(Community(**item))


async def main():
    db = Database(Settings())
    try:
        await seed(db)
    finally:
        await db.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
