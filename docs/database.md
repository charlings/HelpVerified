# Database

PostgreSQL 16. Migrations in `apps/api/app/db/migrations/versions/`, with readable SQL copies in `apps/api/app/db/sql/`. Conventions and the full planned schema are in `.claude/skills/helpverified/references/database.md`. This file shows **what exists now** and is updated with every migration.

| Migration | Milestone | Adds |
| --- | --- | --- |
| `0001` baseline | B1 | Extensions `pgcrypto` and `citext`; `set_updated_at()` trigger function |
| `0002` identity | B2 | `user_role`, `account_status` enums; `users`, `refresh_tokens`, `one_time_tokens` |
| `0003` agencies, workers | B3 | Six enums; `agencies`, `agency_members`, `subscriptions`, `workers`, `verification_items`, `verification_documents`, `document_access_log`, `audit_log`; **rule 1 triggers** |
| `0004` requests, placements | B4 | Five enums; `families`, `requests`, `proposals`, `placements`, `placement_events`, `replacement_requests`; **rule 2 index** |
| `0005` payments | B5 | `payment_kind`, `payment_status`; `payments`, `webhook_events` |
| `0006` notifications, jobs | B6 | `notifications`; `payments.refund_sent_at`, `refund_attempts`; `verification_documents.purged_at` |

## Entity-relationship diagram

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "signs in with"
    users ||--o{ one_time_tokens : "verifies / resets with"
    users ||--o| agency_members : "is admin of"
    agencies ||--|{ agency_members : has
    agencies ||--o| subscriptions : "pays with"
    agencies ||--o{ workers : employs
    workers ||--|{ verification_items : "has exactly 4"
    verification_items ||--o{ verification_documents : "evidenced by"
    verification_documents ||--o{ document_access_log : "viewed in"
    users ||--o{ audit_log : "acts in"
    users ||--o| families : "is"
    families ||--o{ requests : posts
    requests ||--o{ proposals : receives
    workers ||--o{ proposals : "offered in"
    proposals ||--o| placements : "accepted as"
    workers ||--o{ placements : "works in (one active)"
    placements ||--|{ placement_events : "history"
    placements ||--o{ replacement_requests : "replaced via"
    replacement_requests |o--o| requests : "opens"
    placements ||--o{ payments : "fee"
    agencies ||--o{ payments : "subscription"
    users ||--o{ payments : pays
    users ||--o{ notifications : "is told"

    notifications {
        uuid id PK
        uuid user_id FK
        text kind "proposal_received, trial_ending ..."
        text title
        text body
        text link "a web app path"
        text dedupe_key UK "job reminders: once"
        boolean email "also emailed"
        timestamptz emailed_at
        timestamptz mirrored_at "Firestore"
        timestamptz read_at
        smallint attempts
        timestamptz next_attempt_at "NULL: delivered or given up"
        text last_error "error class only"
    }

    payments {
        uuid id PK
        payment_kind kind "placement_fee | subscription"
        uuid placement_id FK "fees"
        uuid agency_id FK "subscriptions"
        bigint amount_kobo
        text paystack_reference UK
        text authorization_url "resumed by /pay"
        payment_status status "pending | success | failed | refunded"
        timestamptz paid_at
        timestamptz refunded_at
        timestamptz refund_sent_at "Paystack accepted the refund"
        smallint refund_attempts
    }
    webhook_events {
        uuid id PK
        text provider
        text event_id "UK with provider"
        text event_type
        jsonb payload "card authorization removed"
        timestamptz processed_at
    }

    families {
        uuid id PK
        uuid user_id FK,UK
        text name "surname family"
    }
    requests {
        uuid id PK
        uuid family_id FK
        worker_role role
        date start_date
        smallint trial_days "7 to 30"
        request_status status "open | matched | cancelled | closed"
        uuid replaces_placement_id FK "replacement copies"
    }
    proposals {
        uuid id PK
        uuid request_id FK
        uuid worker_id FK
        uuid agency_id FK
        proposal_status status "pending | accepted | declined | withdrawn | superseded"
    }
    placements {
        uuid id PK
        uuid worker_id FK "one active per worker"
        uuid request_id FK "one active per request"
        uuid proposal_id FK,UK
        placement_status status "pending_payment | trial | confirmed | ended | cancelled"
        timestamptz hold_expires_at "pending_payment only"
        date trial_starts_on
        date trial_ends_on
        timestamptz confirmed_at
        placement_end_reason end_reason
        smallint replacements_used
    }
    placement_events {
        bigint id PK
        uuid placement_id FK
        placement_status from_status "null on creation"
        placement_status to_status
        uuid actor_id FK "null: system"
    }
    replacement_requests {
        uuid id PK
        uuid placement_id FK
        uuid new_request_id FK
        replacement_status status
    }

    users {
        uuid id PK
        citext email UK
        text password_hash "argon2id; NULL for Google-only"
        user_role role "super_admin | agency_admin | family"
        account_status status "active | suspended"
        timestamptz email_verified_at
        text privacy_notice_version
    }
    agencies {
        uuid id PK
        text name
        text cac_number UK "normalised RC 1234567"
        worker_role_array roles_offered
        agency_status status "pending | approved | suspended | rejected"
        text status_reason "shown to the agency"
        uuid approved_by FK
    }
    subscriptions {
        uuid id PK
        uuid agency_id FK,UK
        subscription_status status "active needed to list (B5 sets it)"
        timestamptz current_period_end
    }
    workers {
        uuid id PK
        uuid agency_id FK
        worker_role role
        text nin_hash UK "HMAC-SHA256; never the raw NIN"
        char4 nin_last4
        timestamptz consent_at
        listing_status listing_status "draft | listed | delisted | suspended"
        timestamptz listed_at "set by the gate trigger"
    }
    verification_items {
        uuid id PK
        uuid worker_id FK
        verification_kind kind "id | guarantor | references | address"
        verification_status status
        jsonb details
        uuid verified_by FK
        timestamptz expires_at "references, address: 12 months"
        text flag_reason "super-admin flag"
    }
    verification_documents {
        uuid id PK
        uuid item_id FK
        text cloudinary_public_id UK "authenticated asset"
        text format "jpg | png | pdf"
        int bytes "at most 10 MB"
        timestamptz deleted_at "soft delete"
        timestamptz purged_at "destroyed in Cloudinary"
    }
    document_access_log {
        bigint id PK
        uuid document_id FK
        uuid user_id FK
        text purpose
        inet ip
    }
    audit_log {
        bigint id PK
        uuid actor_id FK
        text action "agency.approved, worker.check_flagged, document.viewed ..."
        text entity
        uuid entity_id
        jsonb data "label, reason, kind, worker_id"
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        text token_hash UK
        uuid family_id
    }
    one_time_tokens {
        uuid id PK
        uuid user_id FK
        text purpose
        text token_hash UK
    }
```

## Rules enforced in the database

| Rule | How |
| --- | --- |
| **Rule 1: listed only with 4/4 checks verified and unexpired** | `workers_listing_gate` (BEFORE INSERT/UPDATE OF listing_status) raises `P0001`, hint `WORKER_NOT_VERIFIED`; the repository maps it to 409 |
| **Any check leaving `verified` delists the worker** | `verification_items_delist` (AFTER UPDATE OF status); active placements are not ended |
| One worker per NIN, across agencies | `uq_workers_nin_hash` (409 `DUPLICATE_WORKER`) |
| Exactly one row per check per worker | `uq_verification_items_worker_id_kind`; the four rows are created with the worker |
| A verified check names who verified it and when; a rejected one has a reason | `ck_verification_items_verified_has_verifier`, `ck_verification_items_rejected_has_reason` |
| Evidence is jpg/png/pdf, 1 byte to 10 MB | `ck_verification_documents_format`, `ck_verification_documents_bytes` |
| One account per email, case-insensitive | `citext` + `uq_users_email` |
| One agency per CAC number | `uq_agencies_cac_number` (stored normalised) |
| Only token hashes stored | `token_hash` columns |
| `updated_at` is always current | `<table>_set_updated_at` triggers |
| **Rule 2: one active placement per worker** | Partial unique index `placements_one_active_per_worker` (status in pending_payment, trial, confirmed); the accept transaction locks the worker row first; a violation maps to 409 `WORKER_UNAVAILABLE` |
| A request is filled at most once at a time | Partial unique index `placements_one_active_per_request` |
| A placement is consistent with its status | `ck_placements_hold`, `ck_placements_trial_dates`, `ck_placements_confirmed_at`, `ck_placements_end_fields` |
| One proposal per worker per request | `uq_proposals_request_id_worker_id` (a withdrawn proposal is reused when re-proposed) |
| Trials last 7 to 30 days | `ck_requests_trial_days` |
| A webhook event is processed once | `uq_webhook_events_provider_event_id` |
| One open checkout per hold | Partial unique index `payments_one_pending_fee_per_placement` |
| Money is positive integer kobo in NGN; a successful payment has a time | `ck_payments_amount`, `ck_payments_currency`, `ck_payments_paid_at` |
| A fee belongs to a placement, a subscription to an agency | `ck_payments_kind_target` |
| A notification exists exactly when its event was committed | Written in the event's own transaction; delivery (email, Firestore) runs after commit and only updates the notification's delivery columns (ADR 0015) |
| A job's reminder is written once | `uq_notifications_dedupe_key` (insert … on conflict do nothing) |
| Delivery finds due rows quickly; two runs never send one row twice | Partial index `notifications_due`; rows are leased with `FOR UPDATE SKIP LOCKED` |
