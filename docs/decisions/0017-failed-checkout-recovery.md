# 0017 — Failed checkout recovery and payment provider errors

- **Status:** Proposed (awaiting owner review before B7)
- **Date:** 2026-10-15 (fixes from the Swagger test run, `docs/swagger-test-plan.md` issues 2 and 3)
- **Decided by:** Owner (fix both issues, keep the business rules, no contract-breaking changes). Claude Code (the design below). Owner may revisit any item.

## Context

The Swagger run on 2026-10-14 found that when Paystack refused a checkout, `POST /proposals/{id}/accept`
returned `502 PAYMENT_PROVIDER_ERROR` with the message "could not be reached", and that the placement had
already been created. Retrying the accept then returned `409 REQUEST_NOT_OPEN` (with or without the same
`Idempotency-Key`), and the error didn't say a hold existed. Fixing it uncovered a third fault: after a
hold was cancelled or expired, the reopened proposal could never be accepted again, because
`placements.proposal_id` was `UNIQUE` (a 500).

## Decisions

1. **One error code, two reasons.** `PAYMENT_PROVIDER_ERROR` keeps status 502 (api-contracts.md §2), so no
   client breaks. `details.reason` is `unavailable` (no connection, timeout, Paystack 5xx or an unreadable
   reply: retrying later may work) or `rejected` (Paystack answered 4xx or `status: false`: the same request
   will fail again). Each has its own message. Paystack's message, the secret key and customer details are
   never returned to the client; Paystack's short message is logged as before.
2. **The hold still survives a failed checkout** (database.md §7, unchanged). The worker stays held for
   `PAYMENT_HOLD_MINUTES`, so another family can't take them while this family retries (rule 2). The 502
   from accept now adds `details.placement_id` and `details.hold_expires_at`, so the client knows a hold
   exists and can offer "Pay now" or "Cancel".
3. **Accept is resumable.** Accepting the same proposal again while its own hold is unpaid and unexpired
   returns that placement and its checkout (201) instead of `409 REQUEST_NOT_OPEN`. This also covers a
   retry with the same `Idempotency-Key` (failures are never stored, so the retry runs again and is then
   stored). A paid placement (trial or later) still returns 409. A retry after the family's own hold has
   lapsed releases it as the expiry job would and creates a fresh hold, instead of waiting up to a minute
   for the job.
4. **One checkout attempt at a time per placement.** `start_placement_checkout` locks the placement row and
   calls Paystack inside that transaction; the new payment row and its link commit together. A concurrent
   retry waits and then reuses the link, so Paystack is asked once. A failed attempt rolls back and leaves no
   payment row (previously a `failed` row per attempt). The lock is held for at most the Paystack timeout
   (15 s). It never blocks the expiry job, which uses `SKIP LOCKED`. The webhook takes the same order
   (placement, then payment), so there is no deadlock. Agency subscription checkouts are unchanged.
5. **A proposal may have several placements over time** (migration 0007). The unique constraint on
   `placements.proposal_id` becomes a plain index. At most one placement can be active per worker and per
   request (the existing partial unique indexes), so rule 2 is untouched.

## Consequences

- Behaviour change: a second accept of the same proposal while it's still unpaid now returns 201 with the
  same body (previously 409). `test_accept.py` was updated to match.
- The web app's `error-messages.ts` still shows "We couldn't reach our payment provider" for every
  `PAYMENT_PROVIDER_ERROR`. It should read `details.reason` and `details.placement_id` at B7. The MSW accept
  handler should also resume a live hold, to match the API. Neither is changed here (frontend, B7).
- Migration 0007's downgrade fails once any proposal has more than one placement, because it restores the
  unique constraint.
- Not changed: a Paystack refusal of the seeded `@demo.hv` emails (owner input #12).
