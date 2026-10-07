# 0014 — B5: payments and subscriptions through Paystack

- **Status:** Accepted
- **Date:** 2026-10-07 (B5)
- **Decided by:** Claude Code during B5, within ADR 0005 (the payment flow) and the owner's decision that the fee is charged at accept. Owner may revisit any item.

## Decisions

1. **Value is granted in one place.** `PaymentService._settle` is the only code that marks a payment successful and starts a trial or activates a subscription. It runs for the webhook and for the callback page's `verify`. It always asks Paystack (`GET /transaction/verify`) and requires status `success`, the exact amount in kobo and `NGN`. A mismatch changes nothing and is logged without the reference.
2. **The webhook.**
   - The `x-paystack-signature` (HMAC-SHA512 of the raw body with the secret key) is checked before parsing; a bad or missing signature is 401.
   - Each event is stored once (`UNIQUE(provider, event_id)`, the event ID being `<event>:<data.id>`) and marked processed only after it has been handled. A redelivered processed event is acknowledged with no effect.
   - If handling fails, for example because Paystack can't be reached to re-verify, the webhook answers 502 so Paystack retries, and the retry is processed because the event isn't marked processed.
   - Card authorisation details (`authorization`, which can charge the card again), IP addresses and logs are removed before the event is stored.
3. **Late payments are refunded.** If the money arrives after the hold has ended (lapsed or cancelled), the payment is recorded `refunded`, Paystack's refund API is called, and no placement is created or revived, so rule 2 can't be broken by a payment. If the refund call fails, the error is logged for follow-up; B6's retry job will pick it up.
4. **One checkout per hold.** A partial unique index allows one `pending` fee payment per placement. `POST /placements/{id}/pay` (with `Idempotency-Key`) returns the same Paystack checkout. If an earlier attempt never reached Paystack (no link stored), it's marked `failed` and a new reference is used, because Paystack refuses a reused reference. Cancelling or expiring a hold marks its pending payment `failed`.
5. **Lock order is placement, then payment,** in settling as well as in cancelling or expiring a hold, so the two can't deadlock.
6. **The placement fee and the subscription price are settings in kobo** (`PLACEMENT_FEE_KOBO` = 2,000,000 and `AGENCY_SUBSCRIPTION_KOBO` = 2,500,000, the frontend's demo prices), until the owner sets real prices. The subscription amount must match the Paystack plan, because settling compares amounts.
7. **Subscriptions.**
   - `POST /billing/subscription` opens a checkout on `PAYSTACK_AGENCY_PLAN_CODE`. Paystack then renews monthly by itself. The agency must be approved and not already active.
   - Paying activates the subscription for a month.
   - The events `subscription.create`, `subscription.enable`, `subscription.not_renew`, `subscription.disable`, `invoice.payment_failed` and `invoice.update` keep `status`, the Paystack codes and `current_period_end` in step. They're matched by subscription code, else by the customer's email to the agency admin.
   - `reconcile_subscriptions` compares every linked subscription with Paystack; B6 runs it hourly.
   - Without a plan code, subscribing answers 502 ("Subscriptions aren't set up yet"); placement fees don't need it.
8. **Live keys are refused outside production** (`APP_ENV=production` only), and anything that isn't a Paystack secret key is refused too. Error messages never echo the key. The public key isn't read by the API (the web app has its own).
9. **The integration is a small `httpx` client** (initialise, verify, refund, fetch subscription), not an SDK, as with Cloudinary. When Paystack refuses a call, its short message and the HTTP status are logged, never the body (which can hold customer details) or the reference.
10. **Callback pages are the web app's** `/family/payments/callback` and `/agency/billing`. A test checks they still exist in `routes.ts`.

## Consequences

- Paystack can only deliver webhooks to a public URL. Locally, tests send signed events. The live end-to-end webhook is checked once the API is deployed (B8), or through a tunnel.
- Paystack rejects reserved email domains (`.test`, and likely `.hv`): the B8 demo seed must use real-looking addresses for accounts that will pay.
- The "Paystack test vs live for the demo" question in CLAUDE.md stays open; only the key changes.
