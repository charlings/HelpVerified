"""A proposal may be accepted again after its hold is cancelled or expires (ADR 0017).

Releasing an unpaid hold returns its proposal to `pending` (database.md §6), but the UNIQUE constraint on
placements.proposal_id kept every later accept of that proposal from inserting a placement (a 500). The
active-placement indexes per worker (rule 2) and per request still allow at most one live placement, so
the constraint becomes a plain index. Downgrade fails if a proposal already has several placements.

Readable copy: app/db/sql/0007_placement_per_proposal.sql (tests/unit/test_sql_copies.py keeps it identical).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-15
"""

from collections.abc import Sequence

from alembic import op

from app.db.sql_script import split_sql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UPGRADE_SQL = r"""
-- History keeps every placement a proposal produced; only one of them can be active (the partial unique
-- indexes placements_one_active_per_worker and placements_one_active_per_request).
ALTER TABLE placements DROP CONSTRAINT uq_placements_proposal_id;
CREATE INDEX ix_placements_proposal_id ON placements (proposal_id);
"""

DOWNGRADE_SQL = """
DROP INDEX ix_placements_proposal_id;
ALTER TABLE placements ADD CONSTRAINT uq_placements_proposal_id UNIQUE (proposal_id);
"""


def upgrade() -> None:
    for statement in split_sql(UPGRADE_SQL):
        op.execute(statement)


def downgrade() -> None:
    for statement in split_sql(DOWNGRADE_SQL):
        op.execute(statement)
