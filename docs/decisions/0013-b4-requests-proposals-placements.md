# 0013 — B4: requests, proposals and placements

- **Status:** Accepted
- **Date:** 2026-10-07 (B4)
- **Decided by:** Claude Code during B4. Owner may revisit any item.

## Decisions

1. **Rule 2 lives in three places.**
   - The partial unique index `placements_one_active_per_worker` refuses a second active placement for a worker (`pending_payment`, `trial` or `confirmed`).
   - `PlacementService.accept` locks the request, the proposal and the worker row, in that order (every path takes locks in the same order, so they can't deadlock), and only then checks availability.
   - The repository turns an index violation into 409 `WORKER_UNAVAILABLE`, so a code path that ever skips the lock fails cleanly instead of double-booking.
   - Tests prove each layer: direct SQL for every pair of active states, 8 concurrent accepts on separate connections (exactly one placement), and an unlocked insert (409, not 500).

   A second index, `placements_one_active_per_request`, stops one request being filled twice.
2. **Rule 1 is re-checked where a worker is offered or taken.** Proposing and accepting both require the worker to be listed **and** all four checks to be verified and unexpired. A lapsed check blocks them before the nightly expiry job delists the worker (`WORKER_NOT_LISTED`).
3. **Money is B5's.** Accept creates the hold and the placement, commits, then asks a `PaymentGateway` for the checkout link, outside the transaction (database.md §7). If the provider fails, the family gets 502 `PAYMENT_PROVIDER_ERROR` and the hold stands until it lapses. Until B5 wires Paystack, the running API uses `UnconfiguredPayments`, which always fails that way. The web app isn't connected until B7, so nothing user-facing breaks. Paystack, the `payments` table, the webhook and `/placements/{id}/pay` arrive in B5; the webhook will call `PlacementService.start_trial`.
4. **The fee is charged at accept (owner decision, 2026-10-07).** Accepting creates a `pending_payment` hold, and payment starts the trial. `FEE_CHARGED_AT` accepts only `accept`, so a misconfiguration can't half-switch the flow.
5. **Lapsed holds stop counting immediately.** A `pending_payment` placement past `hold_expires_at` doesn't make the worker unavailable when proposing. Accept cancels such holds for its worker inside its own transaction (`payment_expired`, with the request reopened and its proposals back to pending), so the worker isn't stuck until the B6 job. `PlacementService.expire_holds` is the job's body and is tested with a frozen clock.
6. **Trial dates use Nigeria's calendar.** "Today" for trial start, trial end and the "start date isn't in the past" check is the date in WAT (UTC+1, no daylight saving). It's a fixed offset rather than the tz database, which Windows doesn't ship.
7. **Replacement.**
   - It's allowed during the trial, or until `REPLACEMENT_WINDOW_DAYS` (30) after `confirmed_at`, inclusive.
   - The placement ends `replaced`, `replacements_used` goes up, the original request closes, and a copy opens with `replaces_placement_id`, starting today.
   - Accepting a proposal on that copy carries `replacements_used` forward. The fee is waived while `replacements_used <= FREE_REPLACEMENTS`, so such a placement goes straight to `trial` with `payment: null`.
   - The `replacement_requests` row becomes `fulfilled` when its copy is accepted.
8. **Cancelling a hold records `family_ended`** (as the mock does); expiry records `payment_expired`. **Ending** records `family_ended`, `agency_ended` or `admin_ended` by role, closes the request, and an admin end is audited (`placement.ended`).
9. **Idempotency keys** (accept, confirm) are stored in Redis per user, operation and key for 24 h, successful responses only. A replay returns the stored body with `Idempotent-Replay: true`. A concurrent duplicate is still safe, because the second call meets the first one's changes.
10. **Response shapes follow the mock.**
    - Placements carry `worker: {id, full_name, role}` for every party, as `placementOut` does.
    - Families see proposed workers as `WorkerPublicOut` (first name, experience, languages, agency, badge dates; no surname, NIN digits or documents).
    - Agencies see only their own proposals.
    - Shared paths (`/requests`, `/requests/{id}`, `/requests/{id}/proposals`) answer by role; a super admin gets 403 there, as in the mock.
11. **Event actors are derived from the user's role** (`family`, `agency`, `admin`), or `system` when `actor_id` is null (expiry, and payment from B5).
12. **The `requests` ↔ `placements` foreign-key cycle is declared `use_alter=True`** in the model, matching the migration's `ALTER TABLE`. Otherwise SQLAlchemy silently drops those foreign keys from the schema-drift comparison.

## Consequences

- B5 replaces `UnconfiguredPayments` with Paystack, adds `payments` and `/placements/{id}/pay`, and calls `start_trial` from the verified webhook.
- B6 schedules `expire_holds` (every minute) alongside `expire_lapsed`.
