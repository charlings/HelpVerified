# 0012 — B3: agencies, workers and verification

- **Status:** Accepted
- **Date:** 2026-10-07 (B3)
- **Decided by:** Claude Code during B3. Owner may revisit any item.

## Decisions

1. **Rule 1 lives in three places, as planned.** The `workers_listing_gate` trigger refuses any change to `listed` without four verified, unexpired checks (`P0001`, hint `WORKER_NOT_VERIFIED`). The `verification_items_delist` trigger delists a worker the moment any check leaves `verified`. `VerificationService.list_worker` checks first, with the friendly error. The repository maps the trigger's refusal to the same 409, so a race or a missed check can't become a 500. Tests prove each path, including direct SQL.
2. **Expired before the job runs still counts as unverified.** Both the trigger and the service count only checks whose `expires_at` is still in the future. A lapsed check blocks listing even before the nightly expiry job marks it `expired`. `VerificationService.expire_lapsed` is written and tested now; B6 schedules it daily.
3. **A minimal `subscriptions` table arrives in B3.** Listing needs an approved agency with an active subscription (`AGENCY_NOT_ACTIVE` otherwise), so the table exists now with `status` and `current_period_end`. Paystack plans, checkout and reconciliation that set it come in B5. Until then, a subscription is created in tests and by the seed (B8).
4. **Fields that depend on B4 return empty values in the contract shape:** the dashboard's `open_requests` (0) and `trials_ending` (`[]`), `WorkerOut.available` (`true`) and `active_placement` (`null`), and the admin agency detail's `active_placements` (0). Suspending an agency doesn't yet withdraw pending proposals, because proposals don't exist; B4 adds that to the suspend move.
5. **Not built in B3 (they need B4 tables):** `GET /admin/overview` (placements, payments) and `GET /workers/{id}/public` (a family must have received a proposal).
6. **Cloudinary without the SDK.** A small `httpx` client signs uploads (SHA-1 over sorted parameters, verified against Cloudinary's documented example), looks up assets with the Admin API, and builds private download URLs with `expires_at`. Those are the "short-lived signed URLs" for `authenticated` documents. The official SDK is synchronous; three calls didn't justify a blocking dependency. Tests use a fake with the same interface; the real client is checked once against the owner's account.
7. **Registration checks the asset before trusting it:** the folder prefix `workers/docs/<worker_id>/<kind>/`, delivery type `authenticated`, format jpg/png/pdf and at most 10 MB. A failure is 422 with `fields.public_id`, using the mock's messages. A Cloudinary outage during registration is an unhandled 500, because the contract has no upstream-error code outside payments.
8. **Document views write two rows:** `document_access_log` (purpose `verification_review`, IP when it's a real address) and an `audit_log` entry `document.viewed`. The URL is built after the commit and never stored or logged. Families, other agencies and deleted documents all get 404.
9. **CAC numbers are stored normalised** as `RC 1234567` (prefix, one space, digits), so uniqueness ignores spacing and case. A taken number is 422 on `fields.cac_number`, as in the mock, not a 409.
10. **Admin moves:** pending → approved/rejected, approved → suspended, suspended → approved (reinstate), with rejected final. Reject and suspend need a reason of at least 5 characters, which the agency sees. Suspending sets listed workers to `suspended`; reinstating returns them to `delisted`, so relisting goes back through the gate. Every move writes `audit_log`.
11. **Crash logs carry no frame locals.** structlog's default traceback renderer included local variables, and a B3 crash logged the start of a bearer token. Tracebacks now omit locals, and a test covers the crash path. This tightens B2's log-hygiene guarantee.
12. **The migration embeds its SQL; `app/db/sql/` keeps the readable copy;** a test asserts the two are identical statement by statement. A small splitter runs the script one statement at a time (asyncpg won't take several per call), keeping `$$` function bodies whole.
13. **Tests share one running app.** Closing a pooled PostgreSQL connection costs about 3.7 s on the development machine, and `TRUNCATE` about 1.5 s per reset. Tests now share one app and pool for the session and reset data with `DELETE`, taking the suite from 32 minutes to a few minutes. Tests that need other settings still build their own app.

## Consequences

- B4 must fill the placeholder fields in item 4, withdraw pending proposals on suspension, and re-check listing (rule 1) when a worker is proposed or accepted.
- B5 writes `subscriptions`; B6 schedules `expire_lapsed` and the deferred Cloudinary deletion of soft-deleted documents.
