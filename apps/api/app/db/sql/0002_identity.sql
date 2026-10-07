-- Readable copy of migration 0002 (identity, B2). The migration is the source of truth.

CREATE TYPE user_role AS ENUM ('super_admin', 'agency_admin', 'family');
CREATE TYPE account_status AS ENUM ('active', 'suspended');

CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  citext NOT NULL CONSTRAINT uq_users_email UNIQUE,
  password_hash          text NULL,                 -- argon2id; NULL for Google-only accounts
  google_sub             text NULL CONSTRAINT uq_users_google_sub UNIQUE,
  full_name              text NOT NULL,
  phone                  text NULL,
  role                   user_role NOT NULL,
  status                 account_status NOT NULL DEFAULT 'active',
  email_verified_at      timestamptz NULL,
  last_login_at          timestamptz NULL,
  privacy_notice_version text NULL,                 -- accepted at signup
  privacy_accepted_at    timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only SHA-256 hashes of tokens are stored. family_id groups one login's rotation chain:
-- presenting a revoked token revokes every token in its family.
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL CONSTRAINT uq_refresh_tokens_token_hash UNIQUE,
  family_id   uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz NULL,
  replaced_by uuid NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family_id ON refresh_tokens (family_id);

-- Email verification (24 h) and password reset (1 h); single use.
CREATE TABLE one_time_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CONSTRAINT ck_one_time_tokens_purpose CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL CONSTRAINT uq_one_time_tokens_token_hash UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_one_time_tokens_user_id ON one_time_tokens (user_id);
