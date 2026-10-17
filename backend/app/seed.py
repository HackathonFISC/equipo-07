import asyncio
import json
from pathlib import Path

from app.config import Settings
from app.db import Database
from app.models import Community


async def seed(db):
    data = Path(__file__).parents[2] / "data"
    values = json.loads((data / "communities.json").read_text("utf-8"))
    # Official INEC 2023 corregimientos: the same catalog the citizen chatbot offers.
    catalog = json.loads((data / "panama_oeste_corregimientos.json").read_text("utf-8"))
    values += [
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
    async with db.sessions.begin() as session:
        for item in values:
            if not await session.get(Community, item["id"]):
                session.add(Community(**item))


async def main():
    db = Database(Settings())
    try:
        await seed(db)
    finally:
        await db.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
