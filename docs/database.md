# Database

PostgreSQL 16. Migrations in `apps/api/app/db/migrations/versions/`, with readable SQL copies in `apps/api/app/db/sql/`. Conventions and the full planned schema are in `.claude/skills/helpverified/references/database.md`. This file shows **what exists now** and is updated with every migration.

| Migration | Milestone | Adds |
| --- | --- | --- |
| `0001` baseline | B1 | Extensions `pgcrypto` and `citext`; `set_updated_at()` trigger function |
| `0002` identity | B2 | `user_role`, `account_status` enums; `users`, `refresh_tokens`, `one_time_tokens` |
| `0003` agencies, workers | B3 | Six enums; `agencies`, `agency_members`, `subscriptions`, `workers`, `verification_items`, `verification_documents`, `document_access_log`, `audit_log`; **rule 1 triggers** |

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

Rule 2 (one active placement per worker) arrives with `placements` in B4.
