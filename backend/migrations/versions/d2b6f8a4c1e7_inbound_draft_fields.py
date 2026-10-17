"""chatbot conversation fields on inbound drafts"""

import sqlalchemy as sa
from alembic import op

revision = "d2b6f8a4c1e7"
down_revision = "c5a1d7e3f9b2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("inbound_drafts") as batch:
        batch.add_column(sa.Column("fields", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    with op.batch_alter_table("inbound_drafts") as batch:
        batch.drop_column("fields")
