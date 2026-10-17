"""distribution plans"""

import sqlalchemy as sa
from alembic import op

revision = "9b1c2d3e4f50"
down_revision = "3f42f43452fb"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "distribution_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("review", sa.JSON(), nullable=True),
        sa.Column("error", sa.String(length=120), nullable=True),
        sa.Column("events", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_distribution_plans_status"), "distribution_plans", ["status"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_distribution_plans_status"), table_name="distribution_plans")
    op.drop_table("distribution_plans")
