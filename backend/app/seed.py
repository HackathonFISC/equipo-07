import asyncio
import json
from pathlib import Path

from app.config import Settings
from app.db import Database
from app.models import Community


async def seed(db):
    values = json.loads((Path(__file__).parents[2] / "data/communities.json").read_text("utf-8"))
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
