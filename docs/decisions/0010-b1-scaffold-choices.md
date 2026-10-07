# 0010 — B1 scaffold choices

- **Status:** Accepted
- **Date:** 2026-10-07 (B1)
- **Decided by:** Claude Code during B1; owner signed off B1 2026-10-07. Owner may revisit any item.

## Decisions

1. **Python 3.14, pinned to 3.14.x** (`requires-python = ">=3.14,<3.15"`, `.python-version`). It's the version installed on the development machine, and every dependency ships wheels for it. Moving to 3.15 is a one-line change plus a CI run.
2. **Settings keys arrive with the milestone that uses them.** B1 requires only `APP_ENV`, `API_BASE_URL`, `WEB_BASE_URL`, `CORS_ORIGINS` and `DATABASE_URL` (plus optional `LOG_LEVEL` and `MAX_BODY_BYTES`). `JWT_*` and `REDIS_URL` come in B2; Cloudinary and `NIN_PEPPER` in B3; business defaults in B4; Paystack in B5; Firebase and email in B6. Requiring all of `backend.md` §3 now would force placeholder secrets into every developer's `.env` before any code reads them. A test keeps `Settings` and `.env.example` in step.
3. **Missing or invalid settings stop startup** with `MissingSettingsError`, naming each bad key but never its value, because values may be secrets.
4. **Framework errors keep their HTTP status and use the nearest contract code.** Unknown route → 404 `NOT_FOUND`; wrong method → 405 `BAD_REQUEST`; body over 1 MB → 413 `BAD_REQUEST`; malformed JSON → 422 `VALIDATION_ERROR`. No new error codes are added, so the contract (ADR 0009) is unchanged. The web client branches on `code`, not on status.
5. **Errors split across two files.** `core/errors.py` (the `DomainError` classes) has no FastAPI import, so services can raise them without depending on HTTP. `core/error_handlers.py` turns them into responses.
6. **The API's error codes are tested against the web mock's `statusForCode` table** (`tests/unit/test_error_contract.py`), so the codes can't drift from what the frontend was signed off against.
7. **Layer rules are enforced by a test** (`tests/unit/test_architecture.py`): routers can't import SQLAlchemy, `app.db` or a repository; services and repositories can't import FastAPI or Starlette.
8. **`/health` is liveness only** and doesn't touch the database, so a database outage doesn't restart the API. A readiness check that includes the database is left to B8, when Render's health check is configured.
9. **Baseline migration `0001`** enables `pgcrypto` and `citext` and creates the shared `set_updated_at()` trigger function. Tables start in B2. Migrations are named `YYYYMMDD_<rev>_<slug>.py` with hand-picked short revision IDs.
10. **Local Postgres without Docker.** The development machine has no admin rights, so it can't install Docker Desktop or the Postgres installer. `apps/api/scripts/pg-portable.ps1` runs the official EDB PostgreSQL 16 binaries zip from the user's folder, with the same user, password and databases as `docker-compose.yml`. CI uses a `postgres:16` service container. Database tests skip locally when Postgres isn't running, but fail in CI (`CI` is set).

## Consequences

- `.env.example` grows each milestone, and the settings test fails if a key is added to `Settings` without being documented there.
- Developers with Docker use `docker compose up -d postgres redis`; everyone else uses the portable script. Both give the same `DATABASE_URL`.
