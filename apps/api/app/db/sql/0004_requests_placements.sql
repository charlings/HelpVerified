-- Readable copy of migration 0004 (families, requests, proposals, placements; B4).
-- The migration is the source of truth; tests/unit/test_sql_copies.py keeps this file identical to it.

CREATE TYPE request_status       AS ENUM ('open', 'matched', 'cancelled', 'closed');
CREATE TYPE proposal_status      AS ENUM ('pending', 'accepted', 'declined', 'withdrawn', 'superseded');
CREATE TYPE placement_status     AS ENUM ('pending_payment', 'trial', 'confirmed', 'ended', 'cancelled');
CREATE TYPE placement_end_reason AS ENUM ('completed', 'replaced', 'family_ended', 'agency_ended', 'worker_left',
                                          'payment_expired', 'admin_ended');
CREATE TYPE replacement_status   AS ENUM ('open', 'fulfilled', 'cancelled');

CREATE TABLE families (
  id           uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_families PRIMARY KEY,
  user_id      uuid NOT NULL CONSTRAINT uq_families_user_id UNIQUE
               CONSTRAINT fk_families_user_id_users REFERENCES users (id) ON DELETE CASCADE,
  name         text NOT NULL,                 -- "<surname> family", shown to agencies
  address_line text NULL,
  state        text NULL,
  lga          text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE requests (
  id                    uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_requests PRIMARY KEY,
  family_id             uuid NOT NULL CONSTRAINT fk_requests_family_id_families REFERENCES families (id),
  role                  worker_role NOT NULL,
  title                 text NOT NULL,
  description           text NOT NULL,
  schedule              text NOT NULL,
  live_in               boolean NOT NULL,
  state                 text NOT NULL,
  lga                   text NOT NULL,
  budget_min_kobo       bigint NULL,
  budget_max_kobo       bigint NULL,
  start_date            date NOT NULL,
  trial_days            smallint NOT NULL DEFAULT 14,
  status                request_status NOT NULL DEFAULT 'open',
  replaces_placement_id uuid NULL,             -- FK added below, once placements exists
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_requests_schedule CHECK (schedule IN ('full_time', 'part_time')),
  CONSTRAINT ck_requests_trial_days CHECK (trial_days BETWEEN 7 AND 30),
  CONSTRAINT ck_requests_budget_range CHECK (budget_min_kobo IS NULL OR budget_max_kobo IS NULL
                                             OR budget_min_kobo <= budget_max_kobo)
);
CREATE INDEX ix_requests_family_id ON requests (family_id);
CREATE INDEX ix_requests_status ON requests (status);
CREATE INDEX ix_requests_replaces_placement_id ON requests (replaces_placement_id);

CREATE TABLE proposals (
  id         uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_proposals PRIMARY KEY,
  request_id uuid NOT NULL CONSTRAINT fk_proposals_request_id_requests REFERENCES requests (id),
  worker_id  uuid NOT NULL CONSTRAINT fk_proposals_worker_id_workers REFERENCES workers (id),
  agency_id  uuid NOT NULL CONSTRAINT fk_proposals_agency_id_agencies REFERENCES agencies (id),
  note       text NULL,
  status     proposal_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_proposals_request_id_worker_id UNIQUE (request_id, worker_id)
);
CREATE INDEX ix_proposals_worker_id ON proposals (worker_id);
CREATE INDEX ix_proposals_agency_id ON proposals (agency_id);
CREATE INDEX ix_proposals_status ON proposals (status);

CREATE TABLE placements (
  id                uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_placements PRIMARY KEY,
  request_id        uuid NOT NULL CONSTRAINT fk_placements_request_id_requests REFERENCES requests (id),
  proposal_id       uuid NOT NULL CONSTRAINT uq_placements_proposal_id UNIQUE
                    CONSTRAINT fk_placements_proposal_id_proposals REFERENCES proposals (id),
  worker_id         uuid NOT NULL CONSTRAINT fk_placements_worker_id_workers REFERENCES workers (id),
  family_id         uuid NOT NULL CONSTRAINT fk_placements_family_id_families REFERENCES families (id),
  agency_id         uuid NOT NULL CONSTRAINT fk_placements_agency_id_agencies REFERENCES agencies (id),
  status            placement_status NOT NULL,
  hold_expires_at   timestamptz NULL,           -- only while pending_payment
  trial_starts_on   date NULL,
  trial_ends_on     date NULL,
  confirmed_at      timestamptz NULL,
  ended_at          timestamptz NULL,
  end_reason        placement_end_reason NULL,
  replacements_used smallint NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_placements_hold CHECK (status <> 'pending_payment' OR hold_expires_at IS NOT NULL),
  CONSTRAINT ck_placements_trial_dates CHECK (status NOT IN ('trial', 'confirmed') OR trial_starts_on IS NOT NULL),
  CONSTRAINT ck_placements_confirmed_at CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CONSTRAINT ck_placements_end_fields CHECK (status NOT IN ('ended', 'cancelled')
                                             OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)),
  CONSTRAINT ck_placements_replacements_used CHECK (replacements_used >= 0)
);
CREATE INDEX ix_placements_request_id ON placements (request_id);
CREATE INDEX ix_placements_worker_id ON placements (worker_id);
CREATE INDEX ix_placements_family_id ON placements (family_id);
CREATE INDEX ix_placements_agency_id ON placements (agency_id);
CREATE INDEX ix_placements_status ON placements (status);

-- Rule 2 (CLAUDE.md, database.md §5): a worker can't be in two active placements. The accept service
-- locks the worker row first; this index is the backstop that makes a missed lock fail, not double-book.
CREATE UNIQUE INDEX placements_one_active_per_worker ON placements (worker_id)
  WHERE status IN ('pending_payment', 'trial', 'confirmed');
-- And a request can't be filled twice.
CREATE UNIQUE INDEX placements_one_active_per_request ON placements (request_id)
  WHERE status IN ('pending_payment', 'trial', 'confirmed');

ALTER TABLE requests ADD CONSTRAINT fk_requests_replaces_placement_id_placements
  FOREIGN KEY (replaces_placement_id) REFERENCES placements (id);

CREATE TABLE placement_events (
  id           bigint GENERATED BY DEFAULT AS IDENTITY CONSTRAINT pk_placement_events PRIMARY KEY,
  placement_id uuid NOT NULL CONSTRAINT fk_placement_events_placement_id_placements REFERENCES placements (id),
  from_status  placement_status NULL,           -- NULL for the event that created the placement
  to_status    placement_status NOT NULL,
  actor_id     uuid NULL CONSTRAINT fk_placement_events_actor_id_users REFERENCES users (id),  -- NULL: system
  reason       text NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_placement_events_placement_id ON placement_events (placement_id);
CREATE INDEX ix_placement_events_actor_id ON placement_events (actor_id);

CREATE TABLE replacement_requests (
  id             uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_replacement_requests PRIMARY KEY,
  placement_id   uuid NOT NULL CONSTRAINT fk_replacement_requests_placement_id_placements REFERENCES placements (id),
  requested_by   uuid NOT NULL CONSTRAINT fk_replacement_requests_requested_by_users REFERENCES users (id),
  reason         text NOT NULL,
  status         replacement_status NOT NULL DEFAULT 'open',
  new_request_id uuid NULL CONSTRAINT fk_replacement_requests_new_request_id_requests REFERENCES requests (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_replacement_requests_placement_id ON replacement_requests (placement_id);
CREATE INDEX ix_replacement_requests_requested_by ON replacement_requests (requested_by);
CREATE INDEX ix_replacement_requests_new_request_id ON replacement_requests (new_request_id);

CREATE TRIGGER families_set_updated_at BEFORE UPDATE ON families FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requests_set_updated_at BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER proposals_set_updated_at BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER placements_set_updated_at BEFORE UPDATE ON placements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER replacement_requests_set_updated_at BEFORE UPDATE ON replacement_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
