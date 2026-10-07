-- Readable copy of migration 0005 (payments and webhook events; B5).
-- The migration is the source of truth; tests/unit/test_sql_copies.py keeps this file identical to it.

CREATE TYPE payment_kind   AS ENUM ('placement_fee', 'subscription');
CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');

CREATE TABLE payments (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_payments PRIMARY KEY,
  kind               payment_kind NOT NULL,
  payer_user_id      uuid NOT NULL CONSTRAINT fk_payments_payer_user_id_users REFERENCES users (id),
  placement_id       uuid NULL CONSTRAINT fk_payments_placement_id_placements REFERENCES placements (id),
  agency_id          uuid NULL CONSTRAINT fk_payments_agency_id_agencies REFERENCES agencies (id),
  amount_kobo        bigint NOT NULL,
  currency           char(3) NOT NULL DEFAULT 'NGN',
  paystack_reference text NOT NULL CONSTRAINT uq_payments_paystack_reference UNIQUE,
  authorization_url  text NULL,              -- Paystack's hosted checkout; resumed by POST /placements/{id}/pay
  status             payment_status NOT NULL DEFAULT 'pending',
  paid_at            timestamptz NULL,
  refunded_at        timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_payments_amount CHECK (amount_kobo > 0),
  CONSTRAINT ck_payments_currency CHECK (currency = 'NGN'),
  CONSTRAINT ck_payments_kind_target CHECK (
    (kind = 'placement_fee' AND placement_id IS NOT NULL) OR (kind = 'subscription' AND agency_id IS NOT NULL)
  ),
  CONSTRAINT ck_payments_paid_at CHECK (status <> 'success' OR paid_at IS NOT NULL)
);
CREATE INDEX ix_payments_payer_user_id ON payments (payer_user_id);
CREATE INDEX ix_payments_placement_id ON payments (placement_id);
CREATE INDEX ix_payments_agency_id ON payments (agency_id);
CREATE INDEX ix_payments_status ON payments (status);
-- A hold has one checkout at a time: paying again resumes it instead of charging twice.
CREATE UNIQUE INDEX payments_one_pending_fee_per_placement ON payments (placement_id)
  WHERE kind = 'placement_fee' AND status = 'pending';

-- Paystack may deliver an event more than once; the unique key makes processing idempotent.
CREATE TABLE webhook_events (
  id           uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_webhook_events PRIMARY KEY,
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,               -- card authorization details are removed before storing
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  CONSTRAINT uq_webhook_events_provider_event_id UNIQUE (provider, event_id)
);

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
