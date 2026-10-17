"""inbound messaging (telegram, whatsapp)"""

import sqlalchemy as sa
from alembic import op

revision = "c5a1d7e3f9b2"
down_revision = "5ed0c1f96df0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inbound_drafts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("conversation_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("text", sa.String(length=8000), nullable=True),
        sa.Column("missing", sa.JSON(), nullable=False),
        sa.Column("report_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inbound_drafts_conversation",
        "inbound_drafts",
        ["channel", "conversation_id", "updated_at"],
        unique=False,
    )
    op.create_index(op.f("ix_inbound_drafts_status"), "inbound_drafts", ["status"], unique=False)
    op.create_table(
        "inbound_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("conversation_id", sa.String(length=64), nullable=False),
        sa.Column("draft_id", sa.String(length=36), nullable=True),
        sa.Column("text", sa.String(length=4096), nullable=True),
        sa.Column("content_type", sa.String(length=16), nullable=False),
        sa.Column("attachments", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["draft_id"], ["inbound_drafts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel", "external_id", name="uq_inbound_messages_external"),
    )
    op.create_index(
        op.f("ix_inbound_messages_draft_id"), "inbound_messages", ["draft_id"], unique=False
    )
    op.create_index(
        op.f("ix_inbound_messages_received_at"), "inbound_messages", ["received_at"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_inbound_messages_received_at"), table_name="inbound_messages")
    op.drop_index(op.f("ix_inbound_messages_draft_id"), table_name="inbound_messages")
    op.drop_table("inbound_messages")
    op.drop_index(op.f("ix_inbound_drafts_status"), table_name="inbound_drafts")
    op.drop_index("ix_inbound_drafts_conversation", table_name="inbound_drafts")
    op.drop_table("inbound_drafts")
