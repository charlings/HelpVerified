"""Checkout attempts, tracked refunds and admin alerts (ADR 0017, target design).

A placement-fee payment row becomes one checkout attempt with its own lifecycle; refunds get their own table
so a refund is complete only when Paystack confirms `processed`; unresolved money states raise persistent
admin alerts. The database enforces the invariants the services rely on:

- I2  at most one applied (`succeeded`) placement fee per placement;
- I4  at most one open attempt (`initiating`, `open`, `unknown`) per placement, and at most 3 attempts per
      hold (`attempt_no`, a proposed fixed cap awaiting owner confirmation);
- I7  an `orphaned` attempt never stored a link;
- I8  committed refunds never exceed the captured amount: `payments.refund_committed_kobo` is kept by a
      trigger and bounded by a single-table CHECK (verified safe under READ COMMITTED and REPEATABLE READ
      on PostgreSQL 16, ADR 0017 section D);
- I9  at most one refund per payment is `submitting` or `uncertain`;
- I11 placement status changes follow the state machine, and `pending_payment -> trial` needs a hold still
      valid at clock_timestamp() (OD1).

Legacy rows are mapped as ADR 0017 section H proposes; nothing is marked refunded without Paystack's
`processed` confirmation, and rows without enough evidence stay unresolved with an alert.

The ALTER TYPE ... ADD VALUE statements run in an autocommit block (they can't be used in the transaction
that adds them). Readable copy: app/db/sql/0008_checkout_attempts_refunds.sql.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-19
"""

from collections.abc import Sequence

from alembic import op

from app.db.sql_script import split_sql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UPGRADE_SQL = r"""
-- Attempt states (placement fees). Subscriptions keep pending / success / failed.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'initiating';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'orphaned';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'succeeded';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refund_due';

CREATE TYPE refund_status AS ENUM (
  'requested', 'submitting', 'uncertain', 'pending', 'processing', 'needs_attention', 'admin_review',
  'processed', 'provider_failed', 'provider_declined', 'voided'
);

ALTER TABLE payments ADD COLUMN attempt_no smallint NULL;
ALTER TABLE payments ADD COLUMN closed_reason text NULL;
ALTER TABLE payments ADD COLUMN watch_until timestamptz NULL;
ALTER TABLE payments ADD COLUMN paystack_transaction_id bigint NULL;
ALTER TABLE payments ADD COLUMN provider_status text NULL;
ALTER TABLE payments ADD COLUMN provider_code text NULL;
ALTER TABLE payments ADD COLUMN provider_checked_at timestamptz NULL;
ALTER TABLE payments ADD COLUMN reconcile_attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN next_reconcile_at timestamptz NULL;
ALTER TABLE payments ADD COLUMN refund_committed_kobo bigint NOT NULL DEFAULT 0;

CREATE TABLE payment_refunds (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_payment_refunds PRIMARY KEY,
  payment_id           uuid NOT NULL CONSTRAINT fk_payment_refunds_payment_id_payments REFERENCES payments (id),
  amount_kobo          bigint NOT NULL,
  status               refund_status NOT NULL DEFAULT 'requested',
  paystack_refund_id   bigint NULL CONSTRAINT uq_payment_refunds_paystack_refund_id UNIQUE,
  submitted_at         timestamptz NULL,
  resubmissions        smallint NOT NULL DEFAULT 0,
  clean_checks         smallint NOT NULL DEFAULT 0,
  provider_status      text NULL,
  provider_code        text NULL,
  provider_checked_at  timestamptz NULL,
  next_check_at        timestamptz NULL DEFAULT now(),
  processed_at         timestamptz NULL,
  resolution_note      text NULL,
  resolved_by          uuid NULL CONSTRAINT fk_payment_refunds_resolved_by_users REFERENCES users (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_payment_refunds_amount CHECK (amount_kobo > 0),
  CONSTRAINT ck_payment_refunds_resubmissions CHECK (resubmissions BETWEEN 0 AND 1)
);
CREATE INDEX ix_payment_refunds_payment_id ON payment_refunds (payment_id);
CREATE INDEX ix_payment_refunds_status ON payment_refunds (status);
-- I9: one ambiguous submission per payment at a time.
CREATE UNIQUE INDEX payment_refunds_one_in_flight_per_payment ON payment_refunds (payment_id)
  WHERE status IN ('submitting', 'uncertain');
CREATE TRIGGER payment_refunds_set_updated_at BEFORE UPDATE ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- I8: committed refunds (every state but the released ones) are counted on the payment row, so concurrent
-- reservations conflict on that row and the CHECK below refuses an over-commit. A refund's amount never
-- changes once written.
CREATE FUNCTION payment_refund_counts(s refund_status) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT s NOT IN ('provider_failed', 'provider_declined', 'voided')
$$;

CREATE FUNCTION track_refund_commitment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta bigint := 0;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.amount_kobo <> OLD.amount_kobo THEN
    RAISE EXCEPTION 'a refund amount never changes' USING ERRCODE = 'P0001', HINT = 'REFUND_AMOUNT_FIXED';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND payment_refund_counts(NEW.status) THEN
    delta := delta + NEW.amount_kobo;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND payment_refund_counts(OLD.status) THEN
    delta := delta - OLD.amount_kobo;
  END IF;
  IF delta <> 0 THEN
    UPDATE payments SET refund_committed_kobo = refund_committed_kobo + delta
      WHERE id = COALESCE(NEW.payment_id, OLD.payment_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER payment_refunds_track_commitment AFTER INSERT OR UPDATE OR DELETE ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION track_refund_commitment();

-- The captured amount never changes once money has moved.
CREATE FUNCTION fix_captured_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_kobo <> OLD.amount_kobo
     AND OLD.status IN ('success', 'succeeded', 'refund_due', 'refunded') THEN
    RAISE EXCEPTION 'a captured amount never changes' USING ERRCODE = 'P0001', HINT = 'CAPTURED_AMOUNT_FIXED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payments_fix_captured_amount BEFORE UPDATE OF amount_kobo ON payments
  FOR EACH ROW EXECUTE FUNCTION fix_captured_amount();

CREATE TABLE admin_alerts (
  id               uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_admin_alerts PRIMARY KEY,
  kind             text NOT NULL,
  subject_key      text NOT NULL,             -- "payment:<uuid>", "refund:<uuid>" or "reference:<ref>"
  payment_id       uuid NULL CONSTRAINT fk_admin_alerts_payment_id_payments REFERENCES payments (id),
  details          jsonb NOT NULL DEFAULT '{}',
  opened_at        timestamptz NOT NULL DEFAULT now(),
  acknowledged_by  uuid NULL CONSTRAINT fk_admin_alerts_acknowledged_by_users REFERENCES users (id),
  acknowledged_at  timestamptz NULL,
  resolved_by      uuid NULL CONSTRAINT fk_admin_alerts_resolved_by_users REFERENCES users (id),
  resolved_at      timestamptz NULL,
  resolution_note  text NULL,
  CONSTRAINT ck_admin_alerts_kind CHECK (kind IN (
    'checkout_unresolved', 'unmatched_charge', 'refund_attention', 'refund_stuck', 'refund_admin_review',
    'late_payment', 'duplicate_charge', 'settlement_failed', 'legacy_unresolved')),
  CONSTRAINT ck_admin_alerts_resolution CHECK (resolved_at IS NULL OR resolution_note IS NOT NULL)
);
CREATE INDEX ix_admin_alerts_opened_at ON admin_alerts (opened_at);
-- I10: one open alert per kind and subject, so jobs can raise it repeatedly.
CREATE UNIQUE INDEX admin_alerts_one_open_per_subject ON admin_alerts (kind, subject_key)
  WHERE resolved_at IS NULL;

-- Legacy mapping (ADR 0017 section H). Nothing becomes `refunded` here: no legacy row has Paystack's
-- `processed` confirmation, and `refunded_at` / `refund_sent_at` are not evidence of completion.
UPDATE payments SET status = 'succeeded'
  WHERE kind = 'placement_fee' AND status = 'success';

UPDATE payments p SET status = 'open'
  FROM placements pl
  WHERE p.kind = 'placement_fee' AND p.status = 'pending' AND p.authorization_url IS NOT NULL
    AND pl.id = p.placement_id AND pl.status = 'pending_payment' AND pl.hold_expires_at > now();

-- A pending checkout on a placement that's no longer payable shouldn't exist (hold release fails them).
INSERT INTO admin_alerts (kind, subject_key, payment_id, details)
SELECT 'legacy_unresolved', 'payment:' || id, id,
       jsonb_build_object('legacy_status', 'pending', 'reason', 'pending checkout on an ended hold')
FROM payments
WHERE kind = 'placement_fee' AND status = 'pending' AND authorization_url IS NOT NULL;

UPDATE payments SET status = 'closed', closed_reason = 'hold_ended', watch_until = now() + interval '7 days'
  WHERE kind = 'placement_fee' AND status IN ('pending', 'failed') AND authorization_url IS NOT NULL;

UPDATE payments SET status = 'unknown', watch_until = now() + interval '7 days',
                    next_reconcile_at = now()
  WHERE kind = 'placement_fee' AND status IN ('pending', 'failed') AND authorization_url IS NULL;

-- Several successes for one placement shouldn't exist; keep the earliest, send the rest to admin review.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY placement_id ORDER BY paid_at, created_at) AS n
  FROM payments WHERE kind = 'placement_fee' AND status = 'succeeded'
)
UPDATE payments p SET status = 'refund_due' FROM ranked r WHERE p.id = r.id AND r.n > 1;

INSERT INTO payment_refunds (payment_id, amount_kobo, status, submitted_at, next_check_at, created_at)
SELECT id, amount_kobo,
       CASE
         WHEN status = 'refund_due' THEN 'admin_review'
         WHEN refund_attempts >= 10 THEN 'admin_review'
         WHEN refund_sent_at IS NOT NULL OR refund_attempts > 0 THEN 'uncertain'
         ELSE 'requested'
       END::refund_status,
       refund_sent_at, now(), COALESCE(refunded_at, now())
FROM payments
WHERE kind = 'placement_fee' AND status IN ('refunded', 'refund_due');

INSERT INTO admin_alerts (kind, subject_key, payment_id, details)
SELECT 'legacy_unresolved', 'payment:' || p.id, p.id,
       jsonb_build_object('legacy_status', p.status::text, 'reason',
         CASE WHEN p.status = 'refund_due' THEN 'several successes for one placement'
              ELSE 'legacy refund without Paystack confirmation' END)
FROM payments p
WHERE p.kind = 'placement_fee' AND p.status IN ('refunded', 'refund_due');

UPDATE payments SET status = 'refund_due', refunded_at = NULL
  WHERE kind = 'placement_fee' AND status = 'refunded';

ALTER TABLE payments DROP COLUMN refund_sent_at;
ALTER TABLE payments DROP COLUMN refund_attempts;

-- I4 replaces the one-pending-fee index; I2, the attempt cap and I7 are new.
DROP INDEX payments_one_pending_fee_per_placement;
CREATE UNIQUE INDEX payments_one_open_attempt_per_placement ON payments (placement_id)
  WHERE kind = 'placement_fee' AND status IN ('initiating', 'open', 'unknown');
CREATE UNIQUE INDEX payments_one_succeeded_per_placement ON payments (placement_id)
  WHERE kind = 'placement_fee' AND status = 'succeeded';
CREATE UNIQUE INDEX uq_payments_placement_id_attempt_no ON payments (placement_id, attempt_no)
  WHERE attempt_no IS NOT NULL;
CREATE INDEX ix_payments_next_reconcile_at ON payments (next_reconcile_at)
  WHERE next_reconcile_at IS NOT NULL;
CREATE INDEX ix_payments_watch_until ON payments (watch_until) WHERE watch_until IS NOT NULL;
ALTER TABLE payments ADD CONSTRAINT ck_payments_attempt_no CHECK (attempt_no IS NULL OR attempt_no BETWEEN 1 AND 3);
ALTER TABLE payments ADD CONSTRAINT ck_payments_orphaned_has_no_link
  CHECK (status <> 'orphaned' OR authorization_url IS NULL);
ALTER TABLE payments ADD CONSTRAINT ck_payments_refund_committed
  CHECK (refund_committed_kobo >= 0 AND refund_committed_kobo <= amount_kobo);
ALTER TABLE payments ADD CONSTRAINT ck_payments_status_by_kind CHECK (
  (kind = 'subscription' AND status IN ('pending', 'success', 'failed'))
  OR (kind = 'placement_fee' AND status IN ('initiating', 'open', 'unknown', 'rejected', 'failed', 'orphaned',
                                             'closed', 'succeeded', 'refund_due', 'refunded')));
ALTER TABLE payments ADD CONSTRAINT ck_payments_closed_reason
  CHECK (closed_reason IS NULL OR closed_reason IN ('hold_ended', 'superseded', 'ineligible'));
ALTER TABLE payments DROP CONSTRAINT ck_payments_paid_at;
ALTER TABLE payments ADD CONSTRAINT ck_payments_paid_at
  CHECK (status NOT IN ('success', 'succeeded') OR paid_at IS NOT NULL);

-- I11: the placement state machine (apps/api/app/modules/placements/state_machine.py) in the database, so no
-- code path can revive a cancelled placement or start a trial after the hold expired.
CREATE FUNCTION enforce_placement_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
       (OLD.status = 'pending_payment' AND NEW.status IN ('trial', 'cancelled'))
    OR (OLD.status = 'trial' AND NEW.status IN ('confirmed', 'ended'))
    OR (OLD.status = 'confirmed' AND NEW.status = 'ended')
  ) THEN
    RAISE EXCEPTION 'illegal placement transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001', HINT = 'ILLEGAL_TRANSITION';
  END IF;
  IF OLD.status = 'pending_payment' AND NEW.status = 'trial'
     AND (OLD.hold_expires_at IS NULL OR OLD.hold_expires_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'the hold has expired' USING ERRCODE = 'P0001', HINT = 'HOLD_EXPIRED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER placements_enforce_transition BEFORE UPDATE OF status ON placements
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION enforce_placement_transition();
"""

DOWNGRADE_SQL = r"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_refunds WHERE status NOT IN ('processed', 'provider_failed',
                                                                  'provider_declined', 'voided'))
     OR EXISTS (SELECT 1 FROM admin_alerts WHERE resolved_at IS NULL) THEN
    RAISE EXCEPTION 'unresolved refunds or alerts: resolve them before downgrading';
  END IF;
END $$;
DROP TRIGGER placements_enforce_transition ON placements;
DROP FUNCTION enforce_placement_transition();
ALTER TABLE payments ADD COLUMN refund_sent_at timestamptz NULL;
ALTER TABLE payments ADD COLUMN refund_attempts smallint NOT NULL DEFAULT 0;
UPDATE payments p SET refund_sent_at = r.submitted_at, refund_attempts = 1
  FROM payment_refunds r WHERE r.payment_id = p.id AND r.submitted_at IS NOT NULL;
DROP TRIGGER payments_fix_captured_amount ON payments;
DROP FUNCTION fix_captured_amount();
DROP TABLE admin_alerts;
DROP TABLE payment_refunds;
DROP FUNCTION track_refund_commitment();
DROP FUNCTION payment_refund_counts(refund_status);
DROP TYPE refund_status;
DROP INDEX ix_payments_watch_until;
DROP INDEX ix_payments_next_reconcile_at;
DROP INDEX uq_payments_placement_id_attempt_no;
DROP INDEX payments_one_succeeded_per_placement;
DROP INDEX payments_one_open_attempt_per_placement;
ALTER TABLE payments DROP CONSTRAINT ck_payments_closed_reason;
ALTER TABLE payments DROP CONSTRAINT ck_payments_status_by_kind;
ALTER TABLE payments DROP CONSTRAINT ck_payments_refund_committed;
ALTER TABLE payments DROP CONSTRAINT ck_payments_orphaned_has_no_link;
ALTER TABLE payments DROP CONSTRAINT ck_payments_attempt_no;
ALTER TABLE payments DROP CONSTRAINT ck_payments_paid_at;
ALTER TABLE payments ALTER COLUMN status DROP DEFAULT;
UPDATE payments SET status = 'pending' WHERE status IN ('initiating', 'open', 'unknown');
UPDATE payments SET status = 'failed' WHERE status IN ('rejected', 'orphaned', 'closed');
UPDATE payments SET status = 'success' WHERE status = 'succeeded';
UPDATE payments SET status = 'refunded' WHERE status = 'refund_due';
ALTER TYPE payment_status RENAME TO payment_status_0008;
CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
ALTER TABLE payments ALTER COLUMN status TYPE payment_status USING status::text::payment_status;
ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE payment_status_0008;
ALTER TABLE payments ADD CONSTRAINT ck_payments_paid_at CHECK (status <> 'success' OR paid_at IS NOT NULL);
CREATE UNIQUE INDEX payments_one_pending_fee_per_placement ON payments (placement_id)
  WHERE kind = 'placement_fee' AND status = 'pending';
ALTER TABLE payments DROP COLUMN refund_committed_kobo;
ALTER TABLE payments DROP COLUMN next_reconcile_at;
ALTER TABLE payments DROP COLUMN reconcile_attempts;
ALTER TABLE payments DROP COLUMN provider_checked_at;
ALTER TABLE payments DROP COLUMN provider_code;
ALTER TABLE payments DROP COLUMN provider_status;
ALTER TABLE payments DROP COLUMN paystack_transaction_id;
ALTER TABLE payments DROP COLUMN watch_until;
ALTER TABLE payments DROP COLUMN closed_reason;
ALTER TABLE payments DROP COLUMN attempt_no;
"""


def upgrade() -> None:
    statements = split_sql(UPGRADE_SQL)
    enum_values = [s for s in statements if s.startswith("ALTER TYPE")]
    with op.get_context().autocommit_block():  # new enum values must be committed before they're used
        for statement in enum_values:
            op.execute(statement)
    for statement in statements:
        if statement not in enum_values:
            op.execute(statement)


def downgrade() -> None:
    for statement in split_sql(DOWNGRADE_SQL):
        op.execute(statement)
