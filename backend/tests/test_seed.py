import json

from sqlalchemy import func, select

from app.models import Community, Report
from app.seed import COMMUNITIES, seed
from tests.test_evaluations import submit


async def test_seed_updates_existing_rows_and_keeps_reports(system, tmp_path):
    key, _ = await submit(system)
    values = json.loads(COMMUNITIES.read_text("utf-8"))
    changed = next(item for item in values if item["id"] == "arraijan-demo")
    changed.update(population=1234, vulnerability=0.25)
    values.append({**changed, "id": "nueva-comunidad", "name": "Comunidad nueva"})
    path = tmp_path / "communities.json"
    path.write_text(json.dumps(values), "utf-8")

    await seed(system.db, path)
    await seed(system.db, path)

    async with system.db.sessions() as session:
        row = await session.get(Community, "arraijan-demo")
        assert (row.population, row.vulnerability) == (1234, 0.25)
        assert await session.get(Community, "nueva-comunidad") is not None
        assert await session.scalar(select(func.count()).select_from(Community)) == len(values)
        assert (await session.get(Report, key)).community_id == "arraijan-demo"
