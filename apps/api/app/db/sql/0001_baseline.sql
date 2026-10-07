-- Readable copy of migration 0001 (baseline). The migration is the source of truth.

-- gen_random_uuid() for primary keys; citext for case-insensitive emails (database.md §1).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Keeps updated_at current. Each table attaches it from B2 onwards:
--   CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
