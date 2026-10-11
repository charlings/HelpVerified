-- Readable copy of migration 0006 (notifications, refund retries, evidence purging; B6).
-- The migration is the source of truth; tests/unit/test_sql_copies.py keeps this file identical to it.

-- The feed. Rows are written in the same transaction as the event they report, then delivered (Firestore
-- mirror, email) after commit; a failed delivery is retried and never touches business state.
CREATE TABLE notifications (
  id              uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_notifications PRIMARY KEY,
  user_id         uuid NOT NULL CONSTRAINT fk_notifications_user_id_users REFERENCES users (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  link            text NULL,                 -- a web app path, e.g. /family/placements/<id>
  dedupe_key      text NULL CONSTRAINT uq_notifications_dedupe_key UNIQUE,  -- job reminders are sent once
  email           boolean NOT NULL DEFAULT false,
  emailed_at      timestamptz NULL,
  mirrored_at     timestamptz NULL,
  read_at         timestamptz NULL,
  attempts        smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NULL DEFAULT now(),  -- NULL: nothing left to deliver (or given up)
  last_error      text NULL,                 -- an error class name, never a message or payload
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_notifications_attempts CHECK (attempts >= 0)
);
CREATE INDEX ix_notifications_user_id_created_at ON notifications (user_id, created_at);
CREATE INDEX notifications_due ON notifications (next_attempt_at) WHERE next_attempt_at IS NOT NULL;

-- A late payment is refunded (B5); these record whether Paystack accepted the refund, so a job can retry.
ALTER TABLE payments ADD COLUMN refund_sent_at timestamptz NULL;
ALTER TABLE payments ADD COLUMN refund_attempts smallint NOT NULL DEFAULT 0;

-- Deleted evidence is soft-deleted first; the asset is destroyed in Cloudinary by a job, then stamped here.
ALTER TABLE verification_documents ADD COLUMN purged_at timestamptz NULL;
