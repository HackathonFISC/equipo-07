"""create notifications table"""

import sqlalchemy as sa
from alembic import op

revision = "5ed0c1f96df0"
down_revision = "9b1c2d3e4f50"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("community_id", sa.String(length=64), nullable=False),
        sa.Column("incident_ids", sa.JSON(), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("text", sa.String(length=1000), nullable=False),
        sa.Column("arrival", sa.String(length=10), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="READY", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["communities.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["distribution_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "community_id", name="uq_notifications_plan_community"),
    )
    op.create_index(op.f("ix_notifications_plan_id"), "notifications", ["plan_id"], unique=False)
    op.create_index(
        op.f("ix_notifications_community_id"), "notifications", ["community_id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_notifications_community_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_plan_id"), table_name="notifications")
    op.drop_table("notifications")
