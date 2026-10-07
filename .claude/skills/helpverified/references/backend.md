# Backend reference (FastAPI)

Contents: 1. Layout · 2. Layers and their rules · 3. Config · 4. Auth and roles · 5. Errors · 6. Logging · 7. Integrations · 8. Jobs · 9. Rate limiting and cache · 10. Commands

## 1. Layout

```
apps/api/
├── app/
│   ├── main.py                 # create_app(): middleware, routers, exception handlers
│   ├── core/
│   │   ├── config.py           # Settings(BaseSettings), single instance get_settings()
│   │   ├── security.py         # hashing (argon2), JWT encode/decode, HMAC for NIN
│   │   ├── deps.py             # get_db, get_current_user, require_role, get_agency_for_user
│   │   ├── errors.py           # DomainError hierarchy + handlers
│   │   ├── logging.py          # structlog JSON, request_id
│   │   └── rate_limit.py       # Redis sliding window dependency
│   ├── db/
│   │   ├── base.py  session.py
│   │   ├── sql/                # readable copies of triggers/functions
│   │   └── migrations/
│   ├── modules/
│   │   └── <module>/
│   │       ├── router.py       # HTTP only
│   │       ├── schemas.py      # Pydantic request/response models
│   │       ├── service.py      # business rules, transactions
│   │       ├── repository.py   # SQLAlchemy queries only
│   │       ├── models.py       # ORM models
│   │       └── (state_machine.py, policies.py where needed)
│   ├── integrations/           # cloudinary.py paystack.py firestore.py email.py (each behind a small interface)
│   ├── jobs/                   # scheduler.py, expire_holds.py, trial_reminders.py, verification_expiry.py
│   └── scripts/seed.py
└── tests/
    ├── unit/  integration/  concurrency/
    ├── factories.py  conftest.py
```

Modules: `auth`, `users`, `agencies`, `families`, `workers`, `verification`, `requests`, `proposals`, `placements`, `payments`, `notifications`, `admin`.

## 2. Layers and their rules

- **Router:** declare path, dependencies (auth, role, rate limit), parse schema, call one service function, return a response schema. No queries, no business `if`s beyond "is this the caller's resource" which belongs in the service anyway.
- **Service:** owns the transaction (`async with session.begin():`), enforces rules, calls repositories and integrations, raises `DomainError` subclasses. Knows nothing about HTTP (no `HTTPException`, no `Request`).
- **Repository:** SQLAlchemy 2.0 `select()` statements; returns models or simple dataclasses. Translates known DB errors (constraint names, `P0001` hints) into domain errors.
- **Schemas:** separate `XCreate`, `XUpdate`, `XOut`. Response models never include `password_hash`, `nin_hash`, Cloudinary public IDs of documents, or internal notes.
- **Ownership checks** live in services: an agency admin can touch only rows where `agency_id` matches their agency; a family only their own requests and placements. Return 404 (not 403) for other tenants' resources so IDs are not probed.
- Use async SQLAlchemy with `asyncpg`. One session per request via dependency.

## 3. Config

`core/config.py` reads env vars only; nothing else calls `os.environ`. Required keys (mirror in `.env.example`):

```
APP_ENV, API_BASE_URL, WEB_BASE_URL, CORS_ORIGINS
DATABASE_URL, REDIS_URL
JWT_SECRET, JWT_ACCESS_TTL_MIN=15, JWT_REFRESH_TTL_DAYS=14
NIN_PEPPER
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_SIGNED_URL_TTL_SEC=300
PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, PAYSTACK_AGENCY_PLAN_CODE, PLACEMENT_FEE_KOBO
FIREBASE_PROJECT_ID, FIREBASE_CREDENTIALS_JSON
EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM
TRIAL_DAYS_DEFAULT=14, REPLACEMENT_WINDOW_DAYS=30, FREE_REPLACEMENTS=1, FEE_CHARGED_AT=accept, PAYMENT_HOLD_MINUTES=30
SEED_ADMIN_PASSWORD
```

Startup fails fast if a required key is missing in non-test environments.

## 4. Auth and roles

- Passwords: argon2id. Minimum 8 characters, checked against a short common-password list.
- Access token: JWT (HS256), 15 min, claims `sub`, `role`, `agency_id?`, `family_id?`, `exp`, `jti`. Sent as `Authorization: Bearer`.
- Refresh token: random 256-bit, stored hashed, in an `httpOnly; Secure; SameSite=Lax` cookie scoped to `/api/v1/auth`. Rotated on every refresh; reuse of a revoked token revokes the whole family and forces login.
- Google: authorisation-code flow on the backend; match by `google_sub`, else by verified email; new Google users must still choose family or agency.
- Email verification required before a family can post a request or an agency can submit onboarding.
- Dependencies:

```python
def require_role(*roles: Role):
    async def dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise Forbidden()
        return user
    return dep
```

- Suspended users get 403 `ACCOUNT_SUSPENDED` on every authenticated call. Agencies that are not `approved`, or lack an active subscription, get 403 `AGENCY_NOT_ACTIVE` on listing and proposing (they may still manage drafts).

Permission matrix (summary):

| Action | super_admin | agency_admin | family |
| --- | --- | --- | --- |
| Approve / suspend agency | ✓ | | |
| Manage own workers, checklist, documents | | ✓ own agency | |
| View verification documents | ✓ (logged) | ✓ own workers (logged) | never |
| List worker | | ✓ (gate) | |
| Create / cancel request | | | ✓ own |
| See open requests | ✓ | ✓ matching roles/state | own only |
| Propose worker | | ✓ | |
| Accept proposal, pay fee, confirm, request replacement, end | | | ✓ own |
| End placement | ✓ | ✓ own | ✓ own |
| Audit log | ✓ | | |

## 5. Errors

Every non-2xx response uses one envelope:

```json
{ "error": { "code": "WORKER_UNAVAILABLE", "message": "This worker has just been placed with another family.", "details": {}, "request_id": "…" } }
```

```python
class DomainError(Exception):
    code = "DOMAIN_ERROR"; status = 400; message = "Something went wrong."
class NotFound(DomainError): code, status = "NOT_FOUND", 404
class Forbidden(DomainError): code, status = "FORBIDDEN", 403
class Conflict(DomainError): status = 409
class WorkerUnavailable(Conflict): code = "WORKER_UNAVAILABLE"
class WorkerNotVerified(Conflict): code = "WORKER_NOT_VERIFIED"
class IllegalTransition(Conflict): code = "ILLEGAL_TRANSITION"
class DuplicateWorker(Conflict): code = "DUPLICATE_WORKER"
```

Full code list: `references/api-contracts.md` §2. Handlers: `DomainError` → its status; `RequestValidationError` → 422 `VALIDATION_ERROR` with `details.fields`; unknown exceptions → 500 `INTERNAL_ERROR`, logged with stack, message generic.

## 6. Logging

structlog JSON with `request_id` (from `X-Request-ID` or generated), `user_id`, `route`, `status`, `duration_ms`. Never log passwords, tokens, NINs, document URLs, card data or full webhook payloads in production. Domain events (`placement.transitioned`, `worker.listed`, `document.viewed`) are logged at info and written to `audit_log`.

## 7. Integrations

Each integration is a thin class behind a protocol so tests swap in fakes.

- **Cloudinary:** uploads are signed by the API (`POST /uploads/signature`) and go browser → Cloudinary directly. Folders: `workers/photos/<worker_id>` (`type: upload`), `workers/docs/<worker_id>/<kind>` (`type: authenticated`). After upload the client posts the `public_id` back; the API verifies it with the Admin API (exists, folder, size ≤ 10 MB, format in jpg/png/pdf) before saving. Viewing a document: API checks permission, writes `document_access_log`, returns a signed URL valid `CLOUDINARY_SIGNED_URL_TTL_SEC`.
- **Paystack:** `initialize_transaction(email, amount_kobo, reference, metadata, callback_url)`, `verify_transaction(reference)`, subscriptions via plan code. Webhook: verify `x-paystack-signature` (HMAC-SHA512 of raw body with secret key) before parsing; store in `webhook_events` with `UNIQUE(provider,event_id)`; process inside a transaction; always return 200 for duplicates. Always re-verify amount and currency with `verify_transaction` before granting value.
- **Firestore:** write `notifications/{user_id}/items/{id}` with `{type, title, body, link, created_at, read: false}`. Writes happen after the DB transaction commits. Firestore failure is logged and retried by job; it never rolls back business state.
- **Email:** transactional templates for verify email, reset password, proposal received, trial ending, placement confirmed, agency approved.

## 8. Jobs

APScheduler in the API process (single instance) guarded by a Redis lock, or ARQ worker if scaling out.

| Job | Schedule | Action |
| --- | --- | --- |
| `expire_holds` | every minute | `pending_payment` past `hold_expires_at` → `cancelled` (via state machine) |
| `trial_reminders` | daily 08:00 WAT | Notify family and agency 2 days before `trial_ends_on` |
| `verification_expiry` | daily 02:00 WAT | Items past `expires_at` → `expired` (trigger delists) and notify agency |
| `subscription_sync` | hourly | Reconcile subscription status with Paystack |
| `notification_retry` | every 5 min | Retry failed Firestore writes |

Jobs call services, never repositories directly, so rules apply identically. Tests freeze time with `time-machine`.

## 9. Rate limiting and cache

- Redis sliding window: auth endpoints 5/min per IP+email; password reset 3/hour per email; general authenticated 120/min per user; webhook exempt but signature-checked. Exceeded → 429 `RATE_LIMITED` with `Retry-After`.
- Cache only read-heavy, non-personal data (service catalogue, agency public profile) for 5 min; invalidate on write. Never cache worker availability for accept decisions.

## 10. Commands

```
docker compose up -d postgres redis
uv sync
uv run alembic upgrade head
uv run python -m app.scripts.seed
uv run fastapi dev app/main.py
uv run ruff check . && uv run ruff format --check . && uv run mypy app
uv run pytest -q                # unit + integration
uv run pytest tests/concurrency -q   # needs real Postgres
```
