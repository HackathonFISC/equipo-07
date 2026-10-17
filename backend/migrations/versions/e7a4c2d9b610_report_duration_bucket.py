"""Preserve citizen duration intervals independently of exact hours."""

import sqlalchemy as sa
from alembic import op

revision = "e7a4c2d9b610"
down_revision = "d2b6f8a4c1e7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reports", sa.Column("duration_bucket", sa.String(8), nullable=True))


def downgrade():
    with op.batch_alter_table("reports") as batch:
        batch.drop_column("duration_bucket")
