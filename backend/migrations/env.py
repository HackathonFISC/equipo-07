import asyncio

from alembic import context

import app.integrations.models  # noqa: F401  (registra sus tablas en Base.metadata)
from app.config import Settings
from app.db import Database
from app.models import Base


def do_migrations(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def online():
    db = Database(Settings())
    async with db.engine.connect() as connection:
        await connection.run_sync(do_migrations)
    await db.engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=Settings().database_url, target_metadata=Base.metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(online())
