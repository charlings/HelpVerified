# 0005 — Payments follow Paystack's redirect flow, with only the checkout faked

- **Status:** Accepted
- **Date:** 2026-10-05 (M6)
- **Decided by:** Owner, approving the M6 plan

## Context

Families pay a placement fee when they accept a proposal. Phase 1 has no payment provider, but the screens must survive the switch to Paystack (B5) unchanged, and the demo must never look like real money moves.

## Decision

- Accept returns `{placement, payment: {authorization_url, reference} | null}`, exactly as the real API will. The placement waits in `pending_payment` with a 30-minute hold.
- In demo mode `authorization_url` points to `/demo/checkout` (404 when mocking is off, `noindex`, marked "No money moves"). Pay simulates Paystack's `charge.success` webhook; the placement moves to trial.
- The family always returns to the real callback page (`/family/payments/callback`), which trusts only `GET /payments/{reference}/verify`.
- A payment arriving after the hold expired is refunded and creates no placement. `POST /placements/{id}/pay` resumes the same checkout instead of creating a second payment.
- A replacement within the free allowance skips payment (`payment: null`); the allowance is counted per placement fee, carried to the replacing placement.

## Consequences

Swapping in Paystack changes the URL `authorization_url` points to and the webhook source, not the screens. The backend must implement the hold, the idempotent webhook (`webhook_events`), re-verification before granting value, and refund-on-race exactly as the mock does (`mocks/handlers/payments.ts`, `family-requests.ts`).
