-- Readable copy of migration 0007 (a proposal may be accepted again after its hold ends; ADR 0017).
-- The migration is the source of truth; tests/unit/test_sql_copies.py keeps this file identical to it.

-- History keeps every placement a proposal produced; only one of them can be active (the partial unique
-- indexes placements_one_active_per_worker and placements_one_active_per_request).
ALTER TABLE placements DROP CONSTRAINT uq_placements_proposal_id;
CREATE INDEX ix_placements_proposal_id ON placements (proposal_id);
