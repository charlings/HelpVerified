# Database

PostgreSQL 16. Migrations in `apps/api/app/db/migrations/versions/`, with readable SQL copies in `apps/api/app/db/sql/`. Conventions and the full planned schema are in `.claude/skills/helpverified/references/database.md`. This file shows **what exists now** and is updated with every migration.

| Migration | Milestone | Adds |
| --- | --- | --- |
| `0001` baseline | B1 | Extensions `pgcrypto` and `citext`; `set_updated_at()` trigger function |
| `0002` identity | B2 | `user_role`, `account_status` enums; `users`, `refresh_tokens`, `one_time_tokens` |

## Entity-relationship diagram

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "signs in with"
    users ||--o{ one_time_tokens : "verifies / resets with"

    users {
        uuid id PK
        citext email UK
        text password_hash "argon2id; NULL for Google-only"
        text google_sub UK "unused until the Google stage"
        text full_name
        text phone
        user_role role "super_admin | agency_admin | family"
        account_status status "active | suspended"
        timestamptz email_verified_at
        timestamptz last_login_at
        text privacy_notice_version
        timestamptz privacy_accepted_at
        timestamptz created_at
        timestamptz updated_at "trigger"
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        text token_hash UK "SHA-256"
        uuid family_id "one sign-in's rotation chain"
        timestamptz expires_at
        timestamptz revoked_at
        uuid replaced_by
        timestamptz created_at
    }
    one_time_tokens {
        uuid id PK
        uuid user_id FK
        text purpose "verify_email | reset_password"
        text token_hash UK "SHA-256"
        timestamptz expires_at
        timestamptz used_at
        timestamptz created_at
    }
```

## Rules enforced in the database

| Rule | How |
| --- | --- |
| One account per email, case-insensitive | `citext` + `uq_users_email` (repository maps it to 409 `EMAIL_TAKEN`) |
| Only token hashes stored | `token_hash` columns; raw tokens exist only in the cookie or email |
| Tokens die with their user | `ON DELETE CASCADE` on both token tables |
| `updated_at` is always current | `users_set_updated_at` trigger |

The two hard rules (listing gate, one active placement) arrive with their tables in B3 and B4.
