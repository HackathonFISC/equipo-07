from dataclasses import dataclass

import httpx
import pytest

from app.api import create_app
from app.config import Settings
from app.db import Database, checkpoints
from app.graph import build_graph
from app.models import Base
from app.providers import MockLLMProvider
from app.seed import seed
from app.worker import process_one

TOKEN = "test-coordinator-token-12345"
AUTH = {"X-Coordinator-Token": TOKEN}
WHATSAPP_VERIFY = "test-verify-token"
WHATSAPP_SECRET = "test-app-secret"


@dataclass
class System:
    settings: Settings
    db: Database
    client: httpx.AsyncClient

    async def work(self, provider=None):
        provider = provider or MockLLMProvider()
        async with checkpoints(self.settings) as saver:
            graph = build_graph(self.db, provider, self.settings, saver)
            return await process_one(self.db, graph, provider)


@pytest.fixture
async def system(tmp_path):
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite+aiosqlite:///{tmp_path}/db.sqlite",
        checkpoint_path=str(tmp_path / "checkpoints.sqlite"),
        coordinator_token=TOKEN,
        media_path=str(tmp_path / "media"),
        whatsapp_verify_token=WHATSAPP_VERIFY,
        whatsapp_app_secret=WHATSAPP_SECRET,
        whatsapp_access_token="test-access-token",
        whatsapp_phone_number_id="106540352242922",
    )
    db = Database(settings)
    async with db.engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await seed(db)
    app = create_app(settings)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield System(settings, db, client)
    await app.state.db.engine.dispose()
    await db.engine.dispose()
