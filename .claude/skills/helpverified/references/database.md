# Database reference (PostgreSQL 16)

Contents: 1. Conventions · 2. Enums · 3. Tables · 4. Hard rule A: listing gate · 5. Hard rule B: one active placement · 6. Placement state machine · 7. Transaction recipes · 8. Migrations and seeds

## 1. Conventions

- Primary keys: `uuid` default `gen_random_uuid()`.
- Timestamps: `timestamptz`, columns `created_at`, `updated_at` (trigger-maintained) on every table.
- Money: `bigint` kobo, never floats. Currency column fixed to `'NGN'` for now.
- Emails: `citext`. Enable extensions `pgcrypto`, `citext`.
- Table names plural snake_case; enum types singular (`placement_status`).
- Soft delete only where records have legal or audit value (`deleted_at`); otherwise hard delete.
- Every foreign key has an index. Every status column used in filters has an index.
- Business rules that protect families live in constraints or triggers, not only in Python.

## 2. Enums

```sql
CREATE TYPE user_role            AS ENUM ('super_admin','agency_admin','family');
CREATE TYPE account_status       AS ENUM ('active','suspended');
CREATE TYPE agency_status        AS ENUM ('pending','approved','suspended','rejected');
CREATE TYPE worker_role          AS ENUM ('nanny','driver','cleaner');
CREATE TYPE listing_status       AS ENUM ('draft','listed','delisted','suspended');
CREATE TYPE verification_kind    AS ENUM ('id','guarantor','references','address');
CREATE TYPE verification_status  AS ENUM ('not_started','submitted','verified','rejected','expired');
CREATE TYPE request_status       AS ENUM ('open','matched','cancelled','closed');
CREATE TYPE proposal_status      AS ENUM ('pending','accepted','declined','withdrawn','superseded');
CREATE TYPE placement_status     AS ENUM ('pending_payment','trial','confirmed','ended','cancelled');
CREATE TYPE placement_end_reason AS ENUM ('completed','replaced','family_ended','agency_ended','worker_left','payment_expired');
CREATE TYPE replacement_status   AS ENUM ('open','fulfilled','cancelled');
CREATE TYPE payment_kind         AS ENUM ('placement_fee','subscription');
CREATE TYPE payment_status       AS ENUM ('pending','success','failed','refunded');
CREATE TYPE subscription_status  AS ENUM ('active','non_renewing','past_due','cancelled');
```

Adding an enum value needs its own migration (`ALTER TYPE … ADD VALUE`), which cannot run inside a transaction block on older patterns; use Alembic's `autocommit_block()`.

## 3. Tables

### Identity

```sql
users (
  id uuid PK, email citext UNIQUE NOT NULL, password_hash text NULL,   -- NULL for Google-only accounts
  google_sub text UNIQUE NULL, full_name text NOT NULL, phone text NULL,
  role user_role NOT NULL, status account_status NOT NULL DEFAULT 'active',
  email_verified_at timestamptz NULL, last_login_at timestamptz NULL,
  privacy_notice_version text NULL, privacy_accepted_at timestamptz NULL,   -- accepted at signup (B2, ADR 0011)
  created_at, updated_at
)
refresh_tokens (
  id uuid PK, user_id uuid FK users ON DELETE CASCADE, token_hash text UNIQUE NOT NULL,
  family_id uuid NOT NULL,                  -- rotation chain; reuse of a revoked token revokes the whole family
  expires_at timestamptz NOT NULL, revoked_at timestamptz NULL, replaced_by uuid NULL, created_at
)
one_time_tokens (                           -- email verification + password reset
  id uuid PK, user_id uuid FK, purpose text CHECK (purpose IN ('verify_email','reset_password')),
  token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz NULL, created_at
)
```

### Agencies and families

```sql
agencies (
  id uuid PK, name text NOT NULL, cac_number text UNIQUE NOT NULL, email citext NOT NULL, phone text NOT NULL,
  address_line text NOT NULL, state text NOT NULL, lga text NOT NULL,
  roles_offered worker_role[] NOT NULL DEFAULT '{}',
  status agency_status NOT NULL DEFAULT 'pending', approved_at timestamptz NULL, approved_by uuid NULL FK users,
  created_at, updated_at
)
agency_members ( user_id uuid PK FK users, agency_id uuid FK agencies NOT NULL, created_at )
families (
  id uuid PK, user_id uuid UNIQUE FK users NOT NULL, address_line text NULL, state text NULL, lga text NULL,
  created_at, updated_at
)
```

### Workers and verification

```sql
workers (
  id uuid PK, agency_id uuid FK agencies NOT NULL, full_name text NOT NULL, role worker_role NOT NULL,
  years_experience smallint NOT NULL CHECK (years_experience BETWEEN 0 AND 60),
  bio text NULL, languages text[] NOT NULL DEFAULT '{}', live_in_ok boolean NOT NULL DEFAULT false,
  state text NOT NULL, lga text NOT NULL, expected_salary_min_kobo bigint NULL, expected_salary_max_kobo bigint NULL,
  photo_public_id text NULL,
  nin_hash text UNIQUE NOT NULL,             -- HMAC-SHA256(NIN, NIN_PEPPER); never store raw NIN
  nin_last4 char(4) NOT NULL,
  listing_status listing_status NOT NULL DEFAULT 'draft', listed_at timestamptz NULL,
  created_at, updated_at,
  CHECK (expected_salary_min_kobo IS NULL OR expected_salary_max_kobo IS NULL
         OR expected_salary_min_kobo <= expected_salary_max_kobo)
)
verification_items (
  id uuid PK, worker_id uuid FK workers ON DELETE CASCADE NOT NULL, kind verification_kind NOT NULL,
  status verification_status NOT NULL DEFAULT 'not_started',
  details jsonb NOT NULL DEFAULT '{}',      -- e.g. guarantor name/phone/relationship, referee contacts
  verified_by uuid NULL FK users, verified_at timestamptz NULL, expires_at timestamptz NULL,
  rejection_reason text NULL, created_at, updated_at,
  UNIQUE (worker_id, kind),
  CHECK (status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
)
verification_documents (
  id uuid PK, item_id uuid FK verification_items ON DELETE CASCADE NOT NULL,
  cloudinary_public_id text UNIQUE NOT NULL, resource_type text NOT NULL, format text NOT NULL,
  bytes integer NOT NULL CHECK (bytes <= 10485760), uploaded_by uuid FK users NOT NULL,
  created_at, deleted_at timestamptz NULL
)
document_access_log (
  id bigserial PK, document_id uuid FK verification_documents NOT NULL, user_id uuid FK users NOT NULL,
  purpose text NOT NULL, ip inet NULL, created_at
)
```

When a worker is created, insert all four `verification_items` rows (`not_started`) in the same transaction. Verifying an item requires at least one non-deleted document (checked in the service).

### Requests, proposals, placements

```sql
requests (
  id uuid PK, family_id uuid FK families NOT NULL, role worker_role NOT NULL, title text NOT NULL,
  description text NOT NULL, schedule text NOT NULL CHECK (schedule IN ('full_time','part_time')),
  live_in boolean NOT NULL, state text NOT NULL, lga text NOT NULL,
  budget_min_kobo bigint NULL, budget_max_kobo bigint NULL, start_date date NOT NULL,
  trial_days smallint NOT NULL DEFAULT 14 CHECK (trial_days BETWEEN 7 AND 30),
  status request_status NOT NULL DEFAULT 'open',
  replaces_placement_id uuid NULL FK placements,
  created_at, updated_at
)
proposals (
  id uuid PK, request_id uuid FK requests NOT NULL, worker_id uuid FK workers NOT NULL,
  agency_id uuid FK agencies NOT NULL, note text NULL, status proposal_status NOT NULL DEFAULT 'pending',
  created_at, updated_at,
  UNIQUE (request_id, worker_id)
)
placements (
  id uuid PK, request_id uuid FK requests NOT NULL, proposal_id uuid UNIQUE FK proposals NOT NULL,
  worker_id uuid FK workers NOT NULL, family_id uuid FK families NOT NULL, agency_id uuid FK agencies NOT NULL,
  status placement_status NOT NULL,
  hold_expires_at timestamptz NULL,          -- only for pending_payment
  trial_starts_on date NULL, trial_ends_on date NULL,
  confirmed_at timestamptz NULL, ended_at timestamptz NULL, end_reason placement_end_reason NULL,
  replacements_used smallint NOT NULL DEFAULT 0,
  created_at, updated_at,
  CHECK (status <> 'pending_payment' OR hold_expires_at IS NOT NULL),
  CHECK (status NOT IN ('trial','confirmed','ended') OR trial_starts_on IS NOT NULL),
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CHECK (status NOT IN ('ended','cancelled') OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
)
placement_events (
  id bigserial PK, placement_id uuid FK placements NOT NULL, from_status placement_status NULL,
  to_status placement_status NOT NULL, actor_id uuid NULL FK users, reason text NULL, created_at
)
replacement_requests (
  id uuid PK, placement_id uuid FK placements NOT NULL, requested_by uuid FK users NOT NULL,
  reason text NOT NULL, status replacement_status NOT NULL DEFAULT 'open',
  new_request_id uuid NULL FK requests, created_at, updated_at
)
```

### Billing, webhooks, audit

```sql
payments (
  id uuid PK, kind payment_kind NOT NULL, payer_user_id uuid FK users NOT NULL,
  placement_id uuid NULL FK placements, agency_id uuid NULL FK agencies,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0), currency char(3) NOT NULL DEFAULT 'NGN',
  paystack_reference text UNIQUE NOT NULL, status payment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz NULL, raw jsonb NULL, created_at, updated_at
)
subscriptions (
  id uuid PK, agency_id uuid UNIQUE FK agencies NOT NULL, plan_code text NOT NULL,
  paystack_subscription_code text UNIQUE NULL, paystack_customer_code text NULL,
  status subscription_status NOT NULL, current_period_end timestamptz NULL, created_at, updated_at
)
webhook_events (
  id uuid PK, provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz NULL,
  UNIQUE (provider, event_id)                -- idempotency
)
audit_log (
  id bigserial PK, actor_id uuid NULL FK users, action text NOT NULL, entity text NOT NULL,
  entity_id uuid NULL, data jsonb NOT NULL DEFAULT '{}', ip inet NULL, created_at
)
```

## 4. Hard rule A: listing gate

The service (`verification.service.list_worker`) checks first and returns a friendly error. The trigger is the backstop for any other path (admin SQL, a future bug).

```sql
CREATE FUNCTION enforce_listing_gate() RETURNS trigger AS $$
BEGIN
  IF NEW.listing_status = 'listed' AND (TG_OP = 'INSERT' OR OLD.listing_status <> 'listed') THEN
    IF (SELECT count(*) FROM verification_items
         WHERE worker_id = NEW.id AND status = 'verified'
           AND (expires_at IS NULL OR expires_at > now())) < 4 THEN
      RAISE EXCEPTION 'worker % not fully verified', NEW.id USING ERRCODE = 'P0001', HINT = 'WORKER_NOT_VERIFIED';
    END IF;
    NEW.listed_at := now();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER workers_listing_gate BEFORE INSERT OR UPDATE OF listing_status ON workers
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_gate();

CREATE FUNCTION delist_on_item_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'verified' AND NEW.status <> 'verified' THEN
    UPDATE workers SET listing_status = 'delisted' WHERE id = NEW.worker_id AND listing_status = 'listed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER verification_items_delist AFTER UPDATE OF status ON verification_items
  FOR EACH ROW EXECUTE FUNCTION delist_on_item_change();
```

Expiry: the daily job sets `status='expired'` on items past `expires_at`; the trigger then delists. Delisting does **not** end an active placement; it blocks new proposals and notifies the agency.

The repository maps `P0001` with hint `WORKER_NOT_VERIFIED` to `WorkerNotVerified` → HTTP 409.

## 5. Hard rule B: one active placement per worker

```sql
CREATE UNIQUE INDEX placements_one_active_per_worker
  ON placements (worker_id)
  WHERE status IN ('pending_payment','trial','confirmed');
```

Plus, in the accept transaction, lock the worker row (`SELECT … FROM workers WHERE id = :id FOR UPDATE`) before checking availability, so the second of two concurrent accepts waits, then sees the first placement and fails cleanly. If anything slips past the lock, the index raises `unique_violation` (23505) on `placements_one_active_per_worker`; map that constraint name to `WorkerUnavailable` → HTTP 409. Never let it surface as 500.

Also useful:

```sql
CREATE UNIQUE INDEX placements_one_active_per_request
  ON placements (request_id) WHERE status IN ('pending_payment','trial','confirmed');
```

## 6. Placement state machine

Allowed transitions (mirror exactly in `modules/placements/state_machine.py` and `features/placements/state-machine.ts`):

| From | To | Who / what | Side effects |
| --- | --- | --- | --- |
| (none) | `pending_payment` | Family accepts proposal | Proposal `accepted`; other pending proposals for the request `superseded`; request `matched`; hold 30 min |
| `pending_payment` | `trial` | Paystack `charge.success` webhook | Set trial dates from request `trial_days` |
| `pending_payment` | `cancelled` | Hold expiry job, or family cancels | `end_reason='payment_expired'`; request back to `open`; proposals `superseded` → `pending` |
| `trial` | `confirmed` | Family confirms | `confirmed_at` |
| `trial` | `ended` | Family ends, agency ends, replacement | `end_reason` required |
| `confirmed` | `ended` | Family ends, agency ends, replacement, completed | `end_reason` required |

Everything else raises `IllegalTransition` → 409 `ILLEGAL_TRANSITION`. Every transition writes one `placement_events` row in the same transaction. `ended` and `cancelled` are terminal.

Replacement: allowed while `trial`, or `confirmed` and `now() <= confirmed_at + REPLACEMENT_WINDOW_DAYS`. In one transaction: lock placement, transition to `ended` with `end_reason='replaced'`, create `replacement_requests` row, create new `requests` row copying the original with `replaces_placement_id`, link `new_request_id`, increment `replacements_used`. The fee for the new placement is waived while `replacements_used <= FREE_REPLACEMENTS`.

If the owner switches `FEE_CHARGED_AT` to `confirm`: accept creates `trial` directly, payment is taken at `trial → confirmed`, and `pending_payment` stays unused.

## 7. Transaction recipes

Accept proposal (service layer, one transaction, `READ COMMITTED` is enough with the locks):

```
BEGIN
  SELECT proposal FOR UPDATE                     -- must be 'pending', request owned by caller, request 'open'
  SELECT worker FOR UPDATE                       -- must be 'listed'
  check no active placement for worker           -- friendly WORKER_UNAVAILABLE
  INSERT placement (pending_payment, hold_expires_at = now() + hold)
  UPDATE proposals / requests as in §6
  INSERT placement_events, audit_log
COMMIT
then: initialise Paystack transaction (outside the DB transaction), return authorization_url
```

Webhook `charge.success`: insert `webhook_events` (conflict → already processed, return 200), lock payment by reference, verify amount and status with Paystack API, mark `success`, transition placement `pending_payment → trial`. If the hold already expired and the worker has since been taken, mark the payment for refund and notify; never create a second active placement.

## 8. Migrations and seeds

- Alembic, one migration per logical change, descriptive names (`20261012_add_placements.py`). Autogenerate, then hand-edit: autogenerate misses partial indexes, triggers and enum changes.
- Every migration has a working `downgrade()`; CI runs `upgrade head → downgrade base → upgrade head`.
- Triggers and functions live in migrations via `op.execute`, with their SQL also kept in `apps/api/app/db/sql/` for reading.
- `uv run python -m app.scripts.seed` creates: 1 super admin, 2 approved agencies with subscriptions, 1 pending agency, 8 workers in mixed verification states (at least 2 listed per role), 2 families, requests in each status, and one placement in each state. Seed passwords come from env, never committed.
- `docs/database.md` holds the ERD (Mermaid) and must be updated with every schema migration.
