-- Readable copy of migration 0003 (agencies, workers, verification, audit; B3).
-- The migration is the source of truth; keep this file identical to its UPGRADE statements.

CREATE TYPE agency_status       AS ENUM ('pending', 'approved', 'suspended', 'rejected');
CREATE TYPE worker_role         AS ENUM ('nanny', 'driver', 'cleaner');
CREATE TYPE listing_status      AS ENUM ('draft', 'listed', 'delisted', 'suspended');
CREATE TYPE verification_kind   AS ENUM ('id', 'guarantor', 'references', 'address');
CREATE TYPE verification_status AS ENUM ('not_started', 'submitted', 'verified', 'rejected', 'expired');
CREATE TYPE subscription_status AS ENUM ('active', 'non_renewing', 'past_due', 'cancelled');

CREATE TABLE agencies (
  id            uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_agencies PRIMARY KEY,
  name          text NOT NULL,
  cac_number    text NOT NULL CONSTRAINT uq_agencies_cac_number UNIQUE,   -- normalised "RC 1234567"
  email         citext NOT NULL,
  phone         text NOT NULL,
  address_line  text NOT NULL,
  state         text NOT NULL,
  lga           text NOT NULL,
  roles_offered worker_role[] NOT NULL DEFAULT '{}',
  status        agency_status NOT NULL DEFAULT 'pending',
  status_reason text NULL,                                                  -- shown to a rejected/suspended agency
  approved_at   timestamptz NULL,
  approved_by   uuid NULL CONSTRAINT fk_agencies_approved_by_users REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_agencies_status ON agencies (status);
CREATE INDEX ix_agencies_approved_by ON agencies (approved_by);

CREATE TABLE agency_members (
  user_id    uuid NOT NULL CONSTRAINT pk_agency_members PRIMARY KEY
             CONSTRAINT fk_agency_members_user_id_users REFERENCES users (id) ON DELETE CASCADE,
  agency_id  uuid NOT NULL CONSTRAINT fk_agency_members_agency_id_agencies REFERENCES agencies (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_agency_members_agency_id ON agency_members (agency_id);

-- Paystack fills this in B5; B3 only reads `status` (listing needs an active subscription).
CREATE TABLE subscriptions (
  id                         uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_subscriptions PRIMARY KEY,
  agency_id                  uuid NOT NULL CONSTRAINT uq_subscriptions_agency_id UNIQUE
                             CONSTRAINT fk_subscriptions_agency_id_agencies REFERENCES agencies (id) ON DELETE CASCADE,
  plan_code                  text NOT NULL,
  paystack_subscription_code text NULL CONSTRAINT uq_subscriptions_paystack_subscription_code UNIQUE,
  paystack_customer_code     text NULL,
  status                     subscription_status NOT NULL,
  current_period_end         timestamptz NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workers (
  id                       uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_workers PRIMARY KEY,
  agency_id                uuid NOT NULL CONSTRAINT fk_workers_agency_id_agencies REFERENCES agencies (id),
  full_name                text NOT NULL,
  role                     worker_role NOT NULL,
  years_experience         smallint NOT NULL,
  bio                      text NULL,
  languages                text[] NOT NULL DEFAULT '{}',
  live_in_ok               boolean NOT NULL DEFAULT false,
  state                    text NOT NULL,
  lga                      text NOT NULL,
  expected_salary_min_kobo bigint NULL,
  expected_salary_max_kobo bigint NULL,
  photo_public_id          text NULL,
  nin_hash                 text NOT NULL CONSTRAINT uq_workers_nin_hash UNIQUE,  -- HMAC-SHA256(NIN, NIN_PEPPER)
  nin_last4                char(4) NOT NULL,
  consent_at               timestamptz NOT NULL,                                -- agency confirmed the worker's consent
  listing_status           listing_status NOT NULL DEFAULT 'draft',
  listed_at                timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_workers_years_experience CHECK (years_experience BETWEEN 0 AND 60),
  CONSTRAINT ck_workers_salary_range CHECK (expected_salary_min_kobo IS NULL OR expected_salary_max_kobo IS NULL
                                            OR expected_salary_min_kobo <= expected_salary_max_kobo),
  CONSTRAINT ck_workers_nin_last4 CHECK (nin_last4 ~ '^[0-9]{4}$')
);
CREATE INDEX ix_workers_agency_id ON workers (agency_id);
CREATE INDEX ix_workers_listing_status ON workers (listing_status);

CREATE TABLE verification_items (
  id               uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_verification_items PRIMARY KEY,
  worker_id        uuid NOT NULL CONSTRAINT fk_verification_items_worker_id_workers REFERENCES workers (id) ON DELETE CASCADE,
  kind             verification_kind NOT NULL,
  status           verification_status NOT NULL DEFAULT 'not_started',
  details          jsonb NOT NULL DEFAULT '{}',
  verified_by      uuid NULL CONSTRAINT fk_verification_items_verified_by_users REFERENCES users (id),
  verified_at      timestamptz NULL,
  expires_at       timestamptz NULL,
  rejection_reason text NULL,
  flag_reason      text NULL,       -- a super admin flagged this verified check; cleared on re-verify
  flagged_at       timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_verification_items_worker_id_kind UNIQUE (worker_id, kind),
  CONSTRAINT ck_verification_items_verified_has_verifier
    CHECK (status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CONSTRAINT ck_verification_items_rejected_has_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
CREATE INDEX ix_verification_items_status ON verification_items (status);
CREATE INDEX ix_verification_items_verified_by ON verification_items (verified_by);

CREATE TABLE verification_documents (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_verification_documents PRIMARY KEY,
  item_id              uuid NOT NULL CONSTRAINT fk_verification_documents_item_id_verification_items
                       REFERENCES verification_items (id) ON DELETE CASCADE,
  cloudinary_public_id text NOT NULL CONSTRAINT uq_verification_documents_cloudinary_public_id UNIQUE,
  resource_type        text NOT NULL,
  format               text NOT NULL,
  bytes                integer NOT NULL,
  uploaded_by          uuid NOT NULL CONSTRAINT fk_verification_documents_uploaded_by_users REFERENCES users (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  CONSTRAINT ck_verification_documents_bytes CHECK (bytes > 0 AND bytes <= 10485760),
  CONSTRAINT ck_verification_documents_format CHECK (format IN ('jpg', 'png', 'pdf'))
);
CREATE INDEX ix_verification_documents_item_id ON verification_documents (item_id);
CREATE INDEX ix_verification_documents_uploaded_by ON verification_documents (uploaded_by);

CREATE TABLE document_access_log (
  id          bigint GENERATED BY DEFAULT AS IDENTITY CONSTRAINT pk_document_access_log PRIMARY KEY,
  document_id uuid NOT NULL CONSTRAINT fk_document_access_log_document_id_verification_documents
              REFERENCES verification_documents (id),
  user_id     uuid NOT NULL CONSTRAINT fk_document_access_log_user_id_users REFERENCES users (id),
  purpose     text NOT NULL,
  ip          inet NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_document_access_log_document_id ON document_access_log (document_id);
CREATE INDEX ix_document_access_log_user_id ON document_access_log (user_id);

CREATE TABLE audit_log (
  id         bigint GENERATED BY DEFAULT AS IDENTITY CONSTRAINT pk_audit_log PRIMARY KEY,
  actor_id   uuid NULL CONSTRAINT fk_audit_log_actor_id_users REFERENCES users (id),
  action     text NOT NULL,          -- e.g. agency.approved, worker.check_flagged, document.viewed
  entity     text NOT NULL,          -- agency | worker | placement | document
  entity_id  uuid NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  ip         inet NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_log_actor_id ON audit_log (actor_id);
CREATE INDEX ix_audit_log_action ON audit_log (action);
CREATE INDEX ix_audit_log_entity_id ON audit_log (entity_id);

CREATE TRIGGER agencies_set_updated_at BEFORE UPDATE ON agencies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workers_set_updated_at BEFORE UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER verification_items_set_updated_at BEFORE UPDATE ON verification_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rule 1 (CLAUDE.md, database.md §4): a worker can be listed only with all four checks verified and
-- unexpired. The service checks first with a friendly error; this trigger is the backstop for every
-- other path (raw SQL, a job, a future bug). Leaving `listed` clears listed_at.
CREATE FUNCTION enforce_listing_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.listing_status = 'listed' AND (TG_OP = 'INSERT' OR OLD.listing_status <> 'listed') THEN
    IF (SELECT count(*) FROM verification_items
         WHERE worker_id = NEW.id AND status = 'verified'
           AND (expires_at IS NULL OR expires_at > now())) < 4 THEN
      RAISE EXCEPTION 'worker % not fully verified', NEW.id
        USING ERRCODE = 'P0001', HINT = 'WORKER_NOT_VERIFIED';
    END IF;
    NEW.listed_at := now();
  ELSIF NEW.listing_status <> 'listed' THEN
    NEW.listed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workers_listing_gate BEFORE INSERT OR UPDATE OF listing_status ON workers
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_gate();

-- Any check leaving `verified` (rejected, expired, flagged, evidence removed) delists the worker.
-- An active placement is not ended (database.md §4).
CREATE FUNCTION delist_on_item_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'verified' AND NEW.status <> 'verified' THEN
    UPDATE workers SET listing_status = 'delisted' WHERE id = NEW.worker_id AND listing_status = 'listed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_items_delist AFTER UPDATE OF status ON verification_items
  FOR EACH ROW EXECUTE FUNCTION delist_on_item_change();
