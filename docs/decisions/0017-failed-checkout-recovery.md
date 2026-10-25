# 0017 — Failed checkout recovery and payment provider errors

- **Status:** Proposed — **not accepted.** The owner gave the direction on 2026-10-19 and approved the target
  checkout design **as a design only**. The ADR becomes Accepted only by the owner's explicit approval, after
  the open decisions at the end are resolved. The owner decisions OD1–OD9 (below) are **approved design
  direction**, not acceptance of this ADR, and not authorisation to start B7.
- **Implementation (reconciled 2026-10-25):** the target design was **implemented** on 2026-10-19 in local
  commits `9169985` (API, migration 0008) and `a6f1a3a` (web, mocks, contracts) on `feature/backend`. They are
  **not pushed** and **not signed off**. At the time, this header said the design was not authorised for
  implementation, while the commit message and `docs/CHANGELOG.md` recorded an owner authorisation. On
  **2026-10-25** the owner authorised **retaining** that implementation and continuing its review and
  completion, **from that date onward**. This record doesn't say the implementation was authorised before
  the commits were made. What's built, what's still an open policy decision and what's still unverified at
  Paystack are listed under "Implementation status" at the end. Built code isn't approved policy: the
  provisional values and wording in it wait for the owner's decisions (#7d, #7e).
- **Date:** 2026-10-15 (fixes from the Swagger test run, `docs/swagger-test-plan.md` issues 2 and 3); revised
  six times on 2026-10-19 after the owner's reviews. The fourth revision records the Paystack test-mode
  findings; the fifth records owner decisions OD1–OD9; the sixth incorporates the read-only technical review
  (findings F1–F17). That covers: the expiry decision point, attempt and refund transition tables, checkout
  concurrency, the refund data model, legacy-state mapping, locking and retries, callback coverage, and
  proposed family wording. Items the sixth revision proposes are marked **proposed, awaiting owner
  confirmation**.
- **Decided by:** Owner (direction and design approval, 2026-10-19). Claude Code (the design below). Owner may
  revisit any item.
- **Amends, once accepted:** ADR 0013 §3 and §9, ADR 0014 §3, §4 and §5, ADR 0015 (new jobs). See "Relation to
  earlier ADRs".
- **What exists today:** "Built today" describes the code committed on 2026-10-15 (`4f1b00b`), as checked on
  2026-10-19 **before** `9169985`. Most of that section is now superseded. "Target design" is **implemented**
  in `9169985` and `a6f1a3a`, except for the differences listed under "Implementation status". Its policy
  values (attempt cap, settlement-time rule, refund policy, wording, legacy rows, resubmission gate) are
  still **proposed, awaiting owner confirmation**.

## Context

The Swagger run on 2026-10-14 found that when Paystack refused a checkout, `POST /proposals/{id}/accept`
returned `502 PAYMENT_PROVIDER_ERROR` with the message "could not be reached", and that the placement had
already been created. Retrying the accept then returned `409 REQUEST_NOT_OPEN` (with or without the same
`Idempotency-Key`), and the error didn't say a hold existed. Fixing it uncovered a third fault: after a
hold was cancelled or expired, the reopened proposal could never be accepted again, because
`placements.proposal_id` was `UNIQUE` (a 500).

## Owner direction (2026-10-19)

First review:
1. A proposal may have several placements over time; at most one placement is active per worker (rule 2) and
   per request.
2. Retries are safe and idempotent; the original hold expiry is kept; duplicate attempts don't cause duplicate
   charges.
3. No database lock is held across a network call unless the design justifies it.
4. The contract, generated types, mock handlers, UI messages and Swagger tests agree on the retry semantics.
5. The demo seed writes directly only with documented safeguards and the invariants kept.

Second review (design approval):

6. Verify Paystack's guarantees. A verify that shows no transaction is never proof that the request failed.
   Don't claim duplicate charges are impossible without a defensible guarantee; document the residual risk and
   the recovery path.
7. A stored idempotent response must never make an expired hold or a dead link look usable. Check against
   ADR 0013 §9.
8. Specify the attempt states, constraints, webhook idempotency, reconciliation, and late or duplicate charges,
   with an actionable refund and alert path.

Third review:

9. Make ambiguous initialisation explicit. Specify late-payment and placement invariants with database
   enforcement. Specify a reconciliation and refund lifecycle that is safe to re-run. Keep polling intervals
   provisional. Classify every Paystack claim as documented, observed in test mode, or unverified.

## Decisions (proposed)

1. **One error code, two reasons.** `PAYMENT_PROVIDER_ERROR` keeps status 502 (api-contracts.md §2).
   `details.reason` is `unavailable` (no connection, timeout, Paystack 5xx, an unreadable reply, or a checkout
   whose outcome is still being established: retrying later may work) or `rejected` (a definite refusal: the same
   request will fail again). Paystack's message, the secret key and customer details are never returned;
   Paystack's short message is logged. *(Built.)*
2. **The hold survives a failed checkout** (database.md §7). The worker stays held until `hold_expires_at`
   (rule 2). The 502 from accept adds `details.placement_id` and `details.hold_expires_at`; the 502 from
   `POST /placements/{id}/pay` carries `details.reason` only. *(Built.)*
3. **Accept is resumable** (R1–R4). *(Built.)*
4. **A proposal may have several placements over time** (migration 0007). The unique constraint on
   `placements.proposal_id` becomes a plain index. `placements_one_active_per_worker` and
   `placements_one_active_per_request` are unchanged. *(Built.)*
5. **Checkout, settlement and refunds follow the target design.** *(Implemented in `9169985`; not signed
   off. Policy values provisional, #7d.)*
6. **Idempotent replays are checked for liveness.** *(Implemented in `9169985` (`core/idempotent.py`); not
   signed off.)*
7. **The demo seed writes rows directly, with safeguards.** *(Built; safeguards listed below.)*

## Owner decisions approved as design direction (2026-10-19)

The owner approved these on 2026-10-19 as the **intended design direction**. They aren't acceptance of this
ADR, and they don't authorise B7. *(Reconciled 2026-10-25: the text below was written before `9169985`, which
implemented OD1–OD9 and the test-mode design recommendations on 2026-10-19. The owner authorised retaining
that implementation on 2026-10-25. For what's built and how it differs from the text, read "Implementation
status" at the end.)*

The owner's labels were D1–D9. They're written OD1–OD9 here, because D1–D13 already name the documented
Paystack facts.

### OD1. No payment is applied after the hold expires

- A payment is **never applied** to a placement whose `hold_expires_at` has passed, even if `expire_holds`
  hasn't run yet.
- Settlement checks that the hold is still valid (section B, step 5). A late successful payment becomes
  `refund_due`, goes through the refund and reconciliation lifecycle (sections D and E), and **doesn't revive
  the placement or start a trial**.
- The database backs this with the transition trigger in OD9 item 4.
- **Operational consequence:** a family whose payment lands after the hold expired must **accept again**,
  which creates a new hold if the worker is still free (R2). Their late payment is refunded. A refund counts
  as complete **only** when it's confirmed `processed` (OD6, OD8). Requesting it isn't enough.
- This decides technical question Q2.

**Expiry decision point** (sixth revision; the settlement-time rule is **proposed, awaiting owner
confirmation**, `docs/owner-inputs.md` #7d):
- **The authoritative time is the database clock at settlement.** Inside the settlement transaction, after the
  placement row lock is held, the hold is valid only if `hold_expires_at > clock_timestamp()`.
  - `clock_timestamp()` is used, **not** `now()`, because PostgreSQL's `now()` is the transaction's start time
    and could be seconds stale in a transaction that waited on a lock.
  - The application doesn't compare against its own clock for this decision.
- **Nothing else overrides it.** Browser timestamps, the callback's query parameters, anything the customer
  says, and Paystack's `paid_at` don't change the rule. `paid_at` is stored for the record and for admin review
  only; its reliability and timing semantics are unverified.
- **A success confirmed after expiry** is recorded on its attempt. The payment becomes `refund_due`, no trial
  starts, and the payment enters the refund lifecycle (section D) with an alert.
- **If the provider's outcome or timing is uncertain** (for example verify times out, or the reply is
  ambiguous), nothing is decided: the attempt keeps its unresolved state, and a persistent alert is raised if
  that persists past the reconciliation threshold. The design never guesses which side of the deadline a
  payment fell on.
- **The trigger and the application agree.** The proposed placement-transition trigger (OD9 item 4) evaluates
  the same rule with `clock_timestamp()` when `pending_payment → trial` is written, and raises SQLSTATE `P0001`
  with hint `HOLD_EXPIRED`, as the listing trigger does with `WORKER_NOT_VERIFIED`. The trigger can disagree with
  the application only if the deadline passes between the check and the write, which is microseconds.
- **Recovery when the trigger rejects:** the transaction is rolled back. Settlement re-runs once in a fresh
  transaction, where the application check now routes the payment to `refund_due`. The successful payment is
  never discarded: its attempt row and the verified provider evidence are re-read in the new transaction, and if
  that retry also fails the attempt stays unresolved with a `settlement_failed` alert (section G).

### OD2. `HOLD_EXPIRED` for operations rejected because the hold expired

- **Intended response:** `409` with `{ "error": { "code": "HOLD_EXPIRED", "message": …, "details": {
  "placement_id", "status" }, "request_id" } }`.
- **When:**
  - an accept or `/pay` replay, or a retry, names a hold that ended unpaid (the idempotency replay rule);
  - a `/pay` for a placement whose hold has expired.
- **User experience:** the family is told that the hold on the worker expired and that they must **accept
  again** to place a new hold (section I: "Your hold on {worker} expired. Accept again to place a new hold.").
  The message never says or implies that nothing was charged: a payment may be in flight, unknown or late when a
  hold expires. Any payment received after expiry is reconciled and, where appropriate, refunded (AT12, section
  D). The family is told about it separately, with section I's wording.
- **Implementation work, not done:**
  - `api-contracts.md` §2 and §4;
  - the API error class and handler;
  - generated types;
  - `apps/web/src/lib/error-messages.ts` and the accept and pay screens;
  - the MSW accept and pay handlers;
  - API, MSW and Playwright tests;
  - `docs/swagger-test-plan.md` (PR17c).

### OD3. Card-only at launch (proposed), and a rule for confirmed failed attempts

**Payment methods.** Card-only is the **proposed initial launch direction**. Before production billing, it's
subject to confirming the supported Paystack configuration (for example the `channels` parameter on
initialise). It's not permission to change payment configuration, and nothing has been changed.

**Confirmed-failure rule** (a new terminal attempt state, `failed`; the final name follows the technical plan):

1. **Close an attempt as `failed` only on authoritative evidence.** That evidence is a server-side verify of the
   attempt's own reference returning `data.status = failed`, with the matching reference, amount and currency.
2. **Never infer failure** from:
   - a browser error or a checkout-page message;
   - the callback's query parameters;
   - what the customer says;
   - a timeout, 5xx or unreadable reply;
   - "not found";
   - `abandoned` (the initial state, O2);
   - any status that isn't documented as failed.
3. **Reconcile before any new attempt.** Before opening a new attempt, verify every earlier attempt for the
   placement:
   - if any is `success`, it goes to settlement and no new attempt is opened;
   - if any is `ongoing`, `pending`, `processing`, `queued` or `reversal-pending` (a successful or potentially
     successful payment), no new attempt is opened.
4. **Open a new attempt only while the hold is valid**, with a new reference, subject to I4 (one open attempt
   per placement). **If the hold has expired, no new attempt is started** for that placement.
5. **Escalate anything uncertain.** If the result is unknown, contradictory or possibly recoverable, the
   attempt keeps its unresolved state (`open` or `unknown`) and a persistent admin alert is raised.
   A new reference is never created blindly.
6. **Keep watching a `failed` attempt** until the monitoring window ends (OD5). If a later success arrives on
   that reference, settlement handles it: applied only if no other attempt has succeeded and the hold is valid;
   otherwise `refund_due` (I2, OD1).

**Evidence limitation.** O8 shows that through the **`/charge` endpoint** a declined reference couldn't be
charged again. It says **nothing** about Paystack's **hosted checkout page**, which HelpVerified uses.
Whether a family can retry with another card on the same hosted link (T8, hosted page) is **untested**.
Rule 6 keeps the design safe either way: if the hosted page does allow a retry, a later success on the
`failed` reference is still settled exactly once, and any second charge is refunded.

**Initialisation and concurrency** (sixth revision; implementation requirements unless marked otherwise):
7. **One open attempt per placement, enforced by the database.** This is the partial unique index I4 on
   `initiating`, `open` and `unknown`. Application checks under the placement lock come first, but the index is
   what makes concurrent requests safe. What the caller gets when another checkout is being prepared (an
   `initiating` attempt, or a `23505` on I4) is **contract question X3, open**:
   - `PAYMENT_PROVIDER_ERROR` is defined in `api-contracts.md` §2 as "Paystack unreachable or rejected", so it
     shouldn't be reused for an internal database conflict.
   - The proposed semantics: a 409 meaning "a checkout for this placement is already being prepared; retry
     shortly". It would carry `details.placement_id`, and be returned only after one bounded fresh-transaction
     retry (section G).
   - The code isn't chosen here, and the contract isn't changed.
   - An `unknown` attempt, whose *provider* outcome isn't established, keeps 502 `PAYMENT_PROVIDER_ERROR` with
     `details.reason = unavailable` (decision 1).
8. **Re-check before a usable link is returned.** T2 (section A) locks the placement, then the payment, and
   re-checks that the placement is still `pending_payment` with a valid hold (OD1's clock). If not, the attempt
   becomes `closed`. Its link, if Paystack returned one, is stored for monitoring but **never returned**. The
   caller gets the error for the placement's current state:
   - hold ended unpaid: 409 `HOLD_EXPIRED` (OD2);
   - already paid, from `/pay`: 409 `ILLEGAL_TRANSITION` (as today: `start_placement_checkout` raises it when
     the placement isn't `pending_payment`);
   - already paid, from accept: 409 `REQUEST_NOT_OPEN` (R3).
9. **A replacement reference only when all of these hold:**
   - the previous attempt is authoritatively `failed` (rules 1–2), `rejected` (A3, confirmed), or `orphaned`
     (OD7);
   - no attempt for the placement is `succeeded`, or shows a successful or potentially successful provider
     status (rule 3);
   - the hold is valid.

   An `unknown` or `initiating` attempt **blocks** a replacement until it's reconciled.
10. **At most three attempts per hold** (**proposed, awaiting owner confirmation**, `docs/owner-inputs.md`
    #7d):
    - **a proposed fixed cap of 3**, not a configurable setting: the database constraint holds the literal, so
      changing the number needs a migration. The value itself awaits owner confirmation;
    - **enforced atomically:**
      - T1 holds the placement row lock (`FOR UPDATE`) while it assigns `attempt_no` = (the highest existing
        `attempt_no` for the placement) + 1, and inserts the row in the same transaction;
      - `CHECK (attempt_no BETWEEN 1 AND 3)` rejects a fourth attempt;
      - a unique (`placement_id`, `attempt_no`) rejects two requests that computed the same number, which can
        only happen if the lock was bypassed;
    - **errors:**
      - a `CHECK` violation (`23514`) means the cap was reached;
      - a unique violation (`23505`) on (`placement_id`, `attempt_no`) or on I4 is a **concurrent conflict**,
        not the cap. It's retried once in a fresh transaction (section G), then answered with X3's conflict
        response;
    - **when the cap is reached:** the family gets a 409 whose code is **contract question X2, open**.
      `CHECKOUT_ATTEMPTS_EXHAUSTED` is only a placeholder; no such code exists in `api-contracts.md` §2. The
      family can cancel or let the hold lapse;
    - reaching the cap also raises `checkout_unresolved`, so an admin can see repeated failures (a possible
      sign of card testing).
11. **Races (section G has the locking details):**
    - **Two simultaneous initialisations:** T1 serialises on the placement lock. The second request sees the
      first's `initiating` row and gets X3's conflict response (open; rule 7). If the application check were
      bypassed, I4 (or the `attempt_no` unique) rejects the second insert with `23505`, which is handled as a
      concurrent conflict.
    - **A success webhook during a retry:** if settlement takes the placement lock first, it applies the payment
      and moves the siblings (table "Attempt transitions": `open` → `closed`, `initiating` → `unknown`). The
      retry's T1 then sees the placement isn't `pending_payment` and stops. If T1 commits first, the webhook
      applies afterwards, and the retry's T2 re-check (rule 8) withholds the new link. That new reference stays
      monitored, and any payment to it becomes `refund_due` with a `duplicate_charge` alert.
    - **Expiry racing settlement:** both lock the placement first. `expire_holds` uses `SKIP LOCKED`, so it
      skips a placement settlement holds. Whichever commits first wins, and the other re-reads. A success that
      lands after the hold ended goes to `refund_due` (OD1). No path moves a `cancelled` placement to `trial`.
    - **An OD3 failure confirmation racing a late success:** compare-and-set (section G). An attempt becomes
      `failed` only if, under the locks, it's still `open` and no success has been recorded for it.

### OD4. Persistent admin alerts and an alert list in the admin console

- Unresolved payments and refunds needing attention raise **persistent admin alerts** (section F):
  `checkout_unresolved`, `unmatched_charge`, `refund_attention` and `refund_stuck`, plus the OD3 and OD7
  escalations. The sixth revision adds `refund_admin_review`, `late_payment`, `duplicate_charge`,
  `settlement_failed` and `legacy_unresolved` (section F).
- The **admin console has an alert list.** Admins can view an alert, acknowledge it, and resolve it with an
  explanatory note. Every action is recorded in `audit_log`.
- Refunds are handled **manually in the Paystack dashboard** at first. The admin records the refund ID and
  outcome on the alert. **No in-app refund button** is part of this design.
- **Acknowledging an alert doesn't resolve it.** An alert is resolved only when the admin records the
  outcome. A refund is complete only when it's confirmed `processed`.

### OD5. Seven-day watch window, provisional

- **Seven days, provisional, as a setting.** It's an operational monitoring backstop for missed webhooks. It
  is **not** proof that a checkout link has expired or can't be paid; no expiry is assumed (D6, U2).
- Webhook events for any stored reference keep being settled after the window ends.
- T2 (link lifetime) is **untested**, and must be investigated before production billing (or its risk
  explicitly accepted by the owner).

### OD6. A separate `refund_status` field

- Payment status isn't overloaded. A distinct **`refund_status`** field carries the refund's state.
- **Intended user-facing states, distinguished on screen:**
  - none;
  - refund **requested or in progress** (refund states `requested`, `submitting`, `uncertain`, `pending`,
    `processing`; section D);
  - refund **needs attention** (`needs_attention`, `admin_review`, `provider_failed`, `provider_declined`; an
    admin is acting);
  - refund **completed** (`processed` only).
- **Only a refund confirmed `processed`** (`GET /refund/{id}`, or a verified `refund.processed` webhook) is
  shown as completed.
- `reversal-pending` on the transaction (O5) is never shown as completed.
- **Additive changes required, not made:**
  - `refund_status` on the payment payloads in `api-contracts.md` §4;
  - the API schema;
  - generated types;
  - the family payments screen, the payment callback and notification wording ("refund started", then
    "refund completed");
  - the MSW payment handlers;
  - API and web tests.
- The exact wire values follow the technical plan. This decides technical question Q3.

### OD7. Duplicate-reference reconciliation (test-mode-supported)

- On a `duplicate_reference` reply, **verify the original reference** before deciding anything. A duplicate
  reply proves only that the reference exists. It doesn't prove payment or failure, or that a new reference is
  safe.
- **Never issue a new reference** just because initialise failed or returned an error.
- **A new reference only when all of these hold:**
  - the original attempt has been reconciled into an appropriate terminal failed state (`rejected`, a
    confirmed `failed` per OD3, or `orphaned` with no link ever stored and verify showing it unpaid);
  - no successful or potentially successful payment exists;
  - the hold is still valid.
- Unresolved, contradictory or unrecoverable states raise a **persistent admin alert**.
- This is a **design recommendation supported by test-mode observation O1**. It's not a guarantee of live
  Paystack behaviour.

### OD8. Duplicate-refund reconciliation (test-mode-supported)

- `transaction_reversed` on a refund request is **evidence that a refund may already exist**, not proof that
  it completed.
- Look the refund up by the transaction reference where possible (`GET /refund`, filtered on our side), record
  its refund ID, and track its status.
- **Never resubmit a refund while its outcome is uncertain.**
- Raise a **persistent admin alert** (`refund_stuck` or `refund_attention`) if the refund can't be matched or
  its status can't be established.
- Only a refund confirmed **`processed`** counts as complete.
- O6 and O7 are **test-mode observations only**. Live-mode behaviour still needs verifying, or confirming with
  Paystack, before production billing.
- **Sixth revision:** the refund states, transition table and recovery algorithm are in section D.
  - `submitting` is committed before every external refund call.
  - A crash or timeout after the call makes the refund `uncertain`, never "not sent".
  - An accepted refund request is **not** a completed refund.
  - **Automatic resubmission of an `uncertain` refund is disabled** until live-mode confirmation of refund
    matching and of duplicate-refund refusal (`docs/owner-inputs.md` #13a). Until then, an `uncertain` refund
    that reconciliation can't match goes to `admin_review`.

### OD9. Technical safeguards (approved in principle; implemented and tested locally in `9169985`)

1. Classify Paystack replies by their machine-readable `code`, not by HTTP status alone.
2. Handle both "not found" forms: the observed HTTP 400 `transaction_not_found` (O4) and the documented 404
   (D10).
3. Recognise the observed `reversal-pending` status (O5) without treating it as a completed refund or as a
   success to apply.
4. Enforce illegal placement transitions in the database, including blocking `pending_payment → trial` once
   `hold_expires_at` has passed.
5. If a constraint violation aborts a transaction, roll back and retry any settlement in a **new** transaction.
6. Use **one idempotent settlement path** for webhooks, scheduled jobs and retries.
7. Concurrent webhook deliveries and duplicate refund processing must never grant a duplicate entitlement or
   cause uncontrolled repeated refunds (I2, I8, I9, OD8).
8. Hold **no database lock across a Paystack network call**.

## Recovery rules for accept (built)

"Active" means `pending_payment`, `trial` or `confirmed`; a hold is "live" while `now < hold_expires_at`.

- **R1. Retry while this proposal's own hold is live:** 201 with the same placement and its open checkout (or a
  new attempt if none is open). `hold_expires_at` is never extended.
- **R2. Retry after this request's own hold has lapsed:** in one transaction, accept:
  - releases the lapsed hold as `expire_holds` would (`payment_expired`, request reopened, proposals back to
    pending);
  - re-runs every accept check (request open, proposal pending, worker listed with four verified and unexpired
    checks, worker free);
  - then creates a new hold with a new expiry, or returns that check's error (for example 409
    `WORKER_UNAVAILABLE`).
- **R3. Already paid** (`trial` or later): 409 `REQUEST_NOT_OPEN`.
- **R4. The provider fails:** 502 `PAYMENT_PROVIDER_ERROR` and the hold stands. The family can retry, call
  `/pay`, cancel, or let it lapse.

## Paystack evidence

Checked on 2026-10-19. Paystack's documentation site refuses automated requests (HTTP 403). The documented
facts come from:
- Paystack's OpenAPI specification (`PaystackOSS/openapi`, `dist/paystack.yaml`, last changed 2026-06-09);
- its documentation mirror at `docs-v2.production.paystack.co`: Verify Payments, Webhooks, Refunds, and
  Transaction errors.

The claims below fall into three groups:
- **Documented** (D1–D13): from the specification and the documentation mirror.
- **Unverified** (U1–U8): third-party reports or open questions.
- **Observed in test mode** (O1–O8): from the owner-authorised run of checks T1–T8 on 2026-10-19.

Observations come from Paystack **test mode only**, never from live transactions. They're evidence about test
mode, not documented guarantees, and live mode may behave differently.

### Documented

| # | Claim | Source |
| --- | --- | --- |
| D1 | Initialize takes a "Unique transaction reference" | Spec, `TransactionInitialize.reference` |
| D2 | Reusing a reference fails with "Duplicate Transaction Reference": "This transaction reference has already been used on this integration" | Docs, Transaction errors |
| D3 | Initialize returns `authorization_url`, `access_code` and `reference`; a 400 means "a transaction is initialized with incorrect parameters" | Spec, `TransactionInitializeResponse`, `TransactionInitializeBadRequestModel` |
| D4 | Verify's response has no `authorization_url` or `access_code` | Spec, `VerifyResponse` |
| D5 | Initialize has no idempotency key (idempotency is described only for transfers) | Spec |
| D6 | There is no endpoint to cancel or expire an initialised transaction | Spec (transaction endpoints listed) |
| D7 | Transaction statuses: `abandoned` ("The customer hasn't completed the transaction"), `failed`, `ongoing`, `pending`, `processing`, `queued`, `reversed` ("may mean a refund was issued or a chargeback was logged") and `success`. Read `data.status`, not the call's `status` | Docs, Verify Payments |
| D8 | Webhooks are sent "for just successful transactions" | Docs, Verify Payments |
| D9 | Webhook retries: live mode every 3 minutes for 4 tries, then hourly for 72 hours; test mode hourly for 10 hours; a non-`200` response is a failed attempt; `x-paystack-signature` is an HMAC SHA512 of the body. There's no guidance on duplicate deliveries | Docs, Webhooks |
| D10 | Verify of an unknown reference returns 404 | Spec (`404 NotFound`); Docs, Transaction errors |
| D11 | Refunds are for "a previously completed transaction" and accept the transaction's reference; the amount "must not be more than the original transaction amount" | Spec, `/refund`, `RefundCreate`; Docs, Refunds |
| D12 | Refund statuses: `pending`, `processing`, `needs-attention` (customer bank details needed), `failed` ("your account now reflects the credited amount") and `processed`. Webhooks `refund.pending`, `refund.processing`, `refund.needs-attention`, `refund.processed` and `refund.failed`. A processed refund may take up to 10 business days to reach the customer | Docs, Refunds |
| D13 | `GET /refund` lists refunds by page and date range (`from`, `to`), with **no documented filter by transaction**. `GET /refund/{id}` fetches one refund by its ID | Spec |

### Unverified (third-party reports, or needing a test-mode check)

| # | Claim | Documentation | Test mode (2026-10-19) |
| --- | --- | --- | --- |
| U1 | Re-initialising an existing **unpaid** reference returns its original link | Conflicting: one third-party guide says yes; D2 and another guide say it fails | **Observed: no** (O1). It fails with `duplicate_reference`, with no link. Live mode unverified |
| U2 | An unpaid checkout link stops being payable after about 24 hours | One third-party guide; Paystack publishes no lifetime | **Not tested** (T2). No expiry is assumed |
| U3 | A 4xx refusal from initialize means no transaction was created for that reference | Plausible from D3, not documented | **Partly observed** (O3), for two email-validation refusals only |
| U4 | Verify shows a just-created reference immediately (no read-after-write delay) | Not documented | **Partly observed** (O4): 4 of 4 immediate. A small sample, not a guarantee |
| U5 | A second refund request for an already-refunded transaction is refused | Not documented | **Observed: yes** (O6), for sequential requests on a full refund. Concurrent requests and partial refunds not tested |
| U6 | `refund.*` webhook bodies and `GET /refund` items carry the transaction reference | Not documented in the pages checked | **Partly observed** (O7): `GET /refund` and `GET /refund/{id}` do; webhook bodies not tested |
| U7 | Paystack doesn't send an API-initialised checkout link to the customer by itself | Not documented | **Not tested** (T7): no inbox available |
| U8 | A declined card can retry on the same checkout link | Not documented | **Partly observed** (O8), through the Charge API only; the hosted checkout page wasn't tested |

### Observed in test mode (2026-10-19)

**Setup:**
- The owner authorised the run.
- It used the existing test secret key (`sk_test_`, never printed) from `apps/api/.env`, and refused any other
  key.
- Requests went directly to `https://api.paystack.co` from a one-off script outside the repository.
- Customer email `hv-paystack-probe@example.com`; amount 10,000 kobo (₦100).
- Charges used Paystack's published test cards through `POST /charge`.
- No live key or real money was used.
- 32 requests and responses were recorded outside the repository, with no keys and no card authorisations.

The run left test-mode items on the account: abandoned checkouts, one refunded charge (refund `pending` when
last checked), and one declined charge.

| # | Check | Action | Observed | Establishes (test mode) | Doesn't establish |
| --- | --- | --- | --- | --- | --- |
| O1 | T1 | Initialise reference R1; initialise R1 again with the same amount, then with double the amount | First: 200 with `authorization_url`, `access_code`, `reference`. Both repeats: **HTTP 400 "Duplicate Transaction Reference"**, `type: validation_error`, `code: duplicate_reference`, **no link** | A repeat never returns the original link (U1 is false in test mode). The refusal carries a machine-readable `code` | Live mode; repeats for references that are paid, failed or in progress |
| O2 | T4 (status) | Verify unpaid references straight after initialising | `data.status` **`abandoned`** ("The transaction was not completed") at once, before any customer action | `abandoned` is also the **initial** state of an unpaid checkout, so it's not evidence of abandonment or a final state (consistent with D7) | When, or whether, Paystack moves it on |
| O3 | T3 | Initialise with an invalid email (`not-an-email`, then `probe@demo.hv`); verify that reference; initialise it again validly | Refusals: HTTP 400 `invalid_email_address`, then `invalid_params`. Verify: **HTTP 400 "Transaction reference not found."**, `code: transaction_not_found`. Valid re-initialise: 200 with a link | For these two refusals, no transaction was created | That every 4xx refusal creates nothing (U3 stays partly open) |
| O4 | T4 (timing) and unknown references | Verify 4 new references within about 0.2 s of creation; verify never-created references (O3) | All 4 new references found (200). An unknown reference returns **HTTP 400 `transaction_not_found`, not the 404** in the specification (D10) | No read-after-write delay in 4 cases. "Not found" must be recognised by `code`, not HTTP status | That verify is always immediate; that "not found" means none will exist later |
| O5 | T5 (refund) | Charge R5 successfully (test card), then request a refund | Charge: `success`. Refund: 200 "Refund has been queued for processing", refund `status: pending`, `expected_at` 2026-10-28. Verify R5 afterwards: `data.status` **`reversal-pending`** (not in D7's list). `GET /refund/{id}` about a minute later: still `pending` | **A refund request is not a completed refund.** It stays `pending` with a completion date days away. The transaction shows `reversal-pending` meanwhile | When test mode reaches `processed`; live timing |
| O6 | T5 (duplicate) | Request a refund for R5 twice more: at once, then after 5 s | Both: **HTTP 400 "A refund already exist for this transaction"**, `code: transaction_reversed` | Re-sending a full refund for a transaction that already has one is refused, with a recognisable `code` (U5 true in test mode) | Concurrent requests; partial refunds; live mode |
| O7 | T5 / T6 | Refund an unpaid (initialised) transaction; list refunds for the day; fetch the refund by ID | Unpaid refund: HTTP 400 "This transaction failed", `code: declined`. List items and the fetch include **`transaction_reference`** and the transaction ID | A refund can be matched to its transaction through `GET /refund` (filtered on our side) and `GET /refund/{id}` | `refund.*` webhook bodies (no public webhook URL was available) |
| O8 | T8 | Charge R8 with the decline test card, then charge R8 again with the success card | First: `failed` ("Declined"). Second: HTTP 400 "Duplicate Transaction Reference" (`duplicate_reference`); R8 stays `failed` | Through the Charge API, a declined reference can't be charged again | Whether a family can retry with another card on Paystack's **hosted checkout page**, which HelpVerified uses |

**Not tested:**
- **T2:** how long an unpaid link stays payable. That needs 24 to 72 hours and a payment on the hosted page.
- **T7:** whether Paystack emails the link to the customer. There was no inbox.
- **T6, webhook part:** `refund.*` webhook bodies. There was no public webhook URL.
- **T8, hosted page:** retrying with another card on the hosted checkout page.
- **Not attempted:** concurrent duplicate refund requests, partial refunds, and anything in live mode.

**A refund request is never proof of a completed refund.** Only a refund confirmed `processed` (by
`GET /refund/{id}`, or a verified `refund.processed` webhook) counts as completed; R-f in the design already
says so. O5 confirms the gap in test mode: the request was accepted, but the refund stayed `pending`.

### Design recommendations from the test-mode run (approved as design direction; implemented in `9169985`)

These refine the target design below. On 2026-10-19 the owner approved them as design direction: items 1, 2
and 5–8 under OD9, item 3 as OD7, item 4 as OD8, and item 6 together with OD1. They were implemented and
tested locally in `9169985`. The ADR is still Proposed, and their live-mode behaviour is unverified (#13a).

1. **Classify Paystack replies by `code`, not HTTP status.** The built `PaystackClient._call` treats every 4xx
   as a plain refusal (`PaymentProviderRejected`), including `duplicate_reference`, `transaction_not_found` and
   `transaction_reversed` (verified in the repository). The target design needs them distinguished.
2. **Read every "404" in this ADR as "not found"** (documented as HTTP 404 in D10, observed as HTTP 400
   `transaction_not_found` in O4). The rule doesn't change: not found is never proof that a transaction doesn't
   exist.
3. **A duplicate-reference reply proves only that the reference exists**, not that it was paid or that a new
   reference is safe. Before deciding A7 (`orphaned`), verify the original reference:
   - `success`: settle it through the shared routine (apply or refund); no new reference;
   - `abandoned` or `failed`, with no link ever stored: `orphaned` and watched; only then may a new reference
     be issued (`abandoned` is also the initial state, O2);
   - `ongoing`, `pending`, `processing` or `queued`: someone is paying a link we never delivered. Stay
     `unknown` and raise an admin alert; no new reference;
   - `reversal-pending` or `reversed`: admin alert; no new reference;
   - not found, or an ambiguous reply: stay `unknown` (and alert if "not found" contradicts the duplicate
     reply).
4. **Treat `transaction_reversed` on a refund request as "a refund already exists"**, not as a failure: look it
   up with `GET /refund` by `transaction_reference`, store its ID, then track it to `processed`. Today
   `_send_refund` would count it as a failed attempt and retry until `REFUND_MAX_ATTEMPTS`, raising a false
   "gave up" log rather than a duplicate refund.
5. **Recognise `reversal-pending`** (O5) as a transaction status in settlement and watching. It's never a
   success to apply.
6. **Enforce placement transitions in the database.** Today the only placement trigger sets `updated_at`, so
   the transition rules, including "no cancelled placement is revived", exist in application code only. A
   trigger should reject transitions the state machine doesn't allow, including `pending_payment → trial` once
   `hold_expires_at` has passed (with Q2).
7. **Re-run, don't continue, after a constraint violation.** If the "one succeeded payment per placement" index
   (I2) rejects an update, the transaction is aborted. Settlement must roll back and run the refund path in a new
   transaction.
8. **State that concurrent webhook deliveries rely on idempotent settlement.** Event dedupe is insert-or-ignore,
   so two simultaneous deliveries can both process. That's safe only because settlement re-reads state under
   row locks.

### What the documentation can't establish

- That a duplicate charge is impossible: links can't be cancelled (D6), unpaid ones aren't final (D7), and a
  customer can pay any link they hold.
- That a 404 from verify means no transaction exists now or later (U4). In test mode, "not found" was HTTP 400
  `transaction_not_found` (O4).
- That a lost link can be recovered: verify has no link (D4). In test mode a repeat initialise returned no link
  either (O1).
- That a refund whose request timed out was or wasn't created: there's no documented filter by transaction
  (D13). In test mode, a repeat refund was refused with `transaction_reversed` and the refund list carried
  `transaction_reference` (O6, O7). That isn't a documented guarantee, and live mode is untested.

Test mode narrows these gaps. It doesn't close them for live transactions.

The design below is built so these gaps never cause value to be granted twice or money to go unaccounted for.
Where an outcome can't be established, it stays **unresolved and escalates to an admin**.

## Built today (verified in the repository, 2026-10-19)

*Superseded (reconciled 2026-10-25):* this section describes `4f1b00b`, before `9169985`. Checkout, payment
statuses, the database constraints, settlement, refunds and alerts below were replaced by migration 0008 and
the rewritten `PaymentService`. It's kept as the record of the starting point.

- **Checkout** (`PaymentService.start_placement_checkout`):
  - in one transaction it locks the placement row, reuses a stored link, or inserts a `pending` payment with a
    new reference;
  - it calls initialise **while holding the lock** (the `PaystackClient` timeout is 15 s);
  - any failure rolls back, so an ambiguous timeout loses the reference.
- **Payment statuses** (`PaymentStatus`): `pending`, `success`, `failed` and `refunded`.
- **Database:**
  - `uq_payments_paystack_reference`;
  - `payments_one_pending_fee_per_placement` (unique on `placement_id` where `kind = 'placement_fee'` and
    `status = 'pending'`);
  - `uq_webhook_events_provider_event_id`;
  - `placements_one_active_per_worker` and `placements_one_active_per_request`.
  - There is **no** unique constraint on successful payments per placement.
- **Webhook** (`handle_webhook`):
  - signature check;
  - an `event_id` of `"<event>:<data.id | reference | subscription_code | invoice_code>"`, inserted or fetched
    under `uq_webhook_events_provider_event_id`;
  - skipped when `processed_at` is set;
  - otherwise processed, then `processed_at` is set; on failure the error propagates, so Paystack redelivers
    (`test_a_failed_verify_is_retried_on_redelivery`).
  - Two concurrent deliveries of the same event can both process it. Settlement's checks under row locks make
    the second a no-op (`test_a_duplicate_event_has_no_second_effect` covers sequential repeats).
  - Only `charge.success` and subscription events are handled; `refund.*` events are acknowledged and ignored.
- **Settlement** (`_settle`):
  - verify runs outside any transaction;
  - then the placement is locked, then the payment;
  - a payment already `success` or `refunded` → no-op;
  - a non-success status, or an amount or currency mismatch → no-op;
  - placement `pending_payment` → payment `success` and the trial begins;
  - otherwise → `refunded`, the family is notified, and `_send_refund` runs.
  - A reference with no row is only logged (`payment.unknown_reference`).
- **Hold release** (`_release_hold`): marks the pending fee payment `failed` (`fail_pending_fee`). `expire_holds`
  runs every minute with `SKIP LOCKED`.
- **Refunds** (`_send_refund`, job `refund_retry` every 15 minutes):
  - `refund_attempts` is incremented before the call;
  - on success `refund_sent_at` is set, meaning Paystack accepted the request, **not** that the refund was
    processed;
  - on any provider error it's retried, so a timed-out refund that Paystack processed would be **requested
    again** (outcome undocumented, U5);
  - at `REFUND_MAX_ATTEMPTS` (10) only an error log is written (`payment.refund_gave_up`).
- **No persistent admin alerts exist.**

## Target design (implemented in `9169985`; policy values proposed)

*Reconciled 2026-10-25:* this design was implemented on 2026-10-19. Where the code differs from the text
below, "Implementation status" says how. Items marked "proposed, awaiting owner confirmation" are still
owner decisions, even though the code uses their provisional values.

### Invariants and how they're enforced

| # | Invariant | Database enforcement | Application enforcement |
| --- | --- | --- | --- |
| I1 | At most one active placement per worker and per request | `placements_one_active_per_*` (exist) | Accept checks with locks (exists) |
| I2 | At most one payment **applied** to a placement | New: unique `payments (placement_id)` where `kind = 'placement_fee' AND status = 'succeeded'` | Settlement under the placement lock |
| I3 | No trial starts twice; no cancelled placement is revived | I2, plus the state machine (`pending_payment → trial` only) | Settlement applies only to `pending_payment` |
| I4 | At most one open checkout attempt per placement | New: unique `payments (placement_id)` where `kind = 'placement_fee' AND status IN ('initiating','open','unknown')`, replacing `payments_one_pending_fee_per_placement`. Attempt cap (proposed fixed cap, awaiting owner): `attempt_no` with `CHECK (attempt_no BETWEEN 1 AND 3)` and unique (`placement_id`, `attempt_no`) | T1 below, assigning `attempt_no` under the placement lock; OD3 rules 7–10 |
| I5 | One Paystack transaction per reference | `uq_payments_paystack_reference` (exists), plus D1/D2 at Paystack | — |
| I6 | A link is shown to a family only after it's committed | — | The checkout returns a link only from a committed row (tested) |
| I7 | An `orphaned` attempt never had a link delivered | New `CHECK (status <> 'orphaned' OR authorization_url IS NULL)` | I6 |
| I8 | Every real payment that can't be applied is tracked to refund completion or an explicit unresolved state | New `payment_refunds` table, **several rows per payment allowed** (section D, "Refund data model"). Single-table `CHECK (amount_kobo > 0)`. The aggregate rule "committed refunds ≤ the payment's captured amount" is enforced by a constraint trigger that locks the parent payment row (a cross-table `CHECK` isn't possible in PostgreSQL) | Settlement creates the first refund row in the same transaction that marks the payment `refund_due` |
| I9 | No duplicate or parallel ambiguous refund submission | New partial unique index: at most one refund per payment in `submitting` or `uncertain`. An `uncertain` refund is never resubmitted without reconciliation (section D) | Refund job, under the payment row lock |
| I10 | Every unresolved money state has an open admin alert | New: `admin_alerts` with a unique open alert per (kind, subject) | Jobs raise idempotently |
| I11 | No illegal placement transition; no `trial` after the hold expired | New placement-transition trigger (OD9 item 4) using `clock_timestamp()` (OD1); `P0001` with hint `ILLEGAL_TRANSITION` or `HOLD_EXPIRED` | State machine; settlement's hold check |
| I12 | Applying a payment closes its siblings to checkout activity | — (application rule; I2 and I4 bound the damage if it's missed) | Settlement, in the same transaction ("Attempt transitions") |

Lock order: see section G. The earlier statement here, that request and worker rows always come after the
placement, was **wrong** for today's accept path, and is corrected there.

### Checkout-attempt states

A placement-fee `payments` row is one attempt with one reference. Two properties are kept apart:
- **Checkout activity:** whether the attempt may still create or hand out a link. Only `initiating` and `open`,
  on a placement that is `pending_payment` with a valid hold, are active.
- **Monitoring:** whether the reference is still watched for a late success. This is a timestamp,
  `watch_until`, set when the attempt stops being active (the hold ends, a sibling is applied, or the attempt is
  closed). It isn't a state. Webhooks for a stored reference are settled whatever `watch_until` says.

| State | Meaning | Link stored? | Checkout activity? | Monitored for late success? |
| --- | --- | --- | --- | --- |
| `initiating` | Committed before the initialise call; the call is in flight, or the process died during it | No | Yes, while the hold is valid | — (see `unknown`) |
| `open` | Paystack returned a link, which is stored and may have been shown | Yes | Yes, while the hold is valid | Yes, once the hold ends or a sibling is applied |
| `unknown` | Initialise's outcome isn't established | No | No (blocks replacements, OD3 rule 9) | Yes, by verify only after the hold ends |
| `rejected` | Definite refusal, confirmed by a same-reference retry (A3); no transaction is believed to exist | No | No | Yes, until `watch_until` (U3 is only partly observed) |
| `failed` | Paystack authoritatively reports this reference failed (OD3 rules 1–2) | Maybe | No | Yes (T8 hosted page untested; OD3 rule 6) |
| `orphaned` | A transaction for this reference exists at Paystack, but its link never reached us (OD7) | No | No | Yes |
| `closed` | No longer active: the hold ended, a sibling was applied, or the T2 re-check found the placement ineligible. It may still be paid (D6, D7). `closed_reason` records which | Maybe | No | Yes |
| `succeeded` | Verified success applied to the placement (at most one per placement, I2) | — | No | — |
| `refund_due` | Verified success that must not be applied; one or more `payment_refunds` rows track the refund (section D) | — | No | — |
| `refunded` | The amount owed back has been confirmed `processed` (section D) | — | No | — |

### Attempt transitions (sixth revision)

These are implementation requirements. **None of these transitions exists in code today**; today's statuses
are `pending`, `success`, `failed` and `refunded` ("Built today").

**Locks** (section G): placement → payment, in a short transaction; provider calls happen outside any
transaction. **CAS** means compare-and-set: the update applies only if the attempt is still in the expected
state.

**Attempts reaching `failed`, `rejected`, `orphaned` and `unknown`:**

| # | From | Trigger | Provider evidence | To | Transaction and locks | Monitored? | Family sees | Alert or reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AT1 | — | Accept or `/pay` with no active attempt (OD3 rules 7–10) | None | `initiating` | T1: placement lock; I4 and the `attempt_no` cap enforced; commit **before** the call | — | "Preparing your checkout…" | — |
| AT2 | `initiating` | Initialise returns 200, and the T2 re-check passes | `authorization_url` and `reference` | `open` | T2: placement → payment, CAS from `initiating` | No (still active) | The checkout link | — |
| AT3 | `initiating` | Initialise returns 200, but the T2 re-check fails (expired, cancelled or paid) | As AT2 | `closed` (reason `hold_ended` or `superseded`) | T2, CAS | Yes | 409 `HOLD_EXPIRED`, `ILLEGAL_TRANSITION` or `REQUEST_NOT_OPEN` (OD3 rule 8) | — |
| AT4 | `initiating` | A definite 4xx that isn't `duplicate_reference` | Parseable 4xx, `status: false`, with `code` | `rejected` once the same-reference retry confirms it (A3) | T2, CAS | Yes (U3) | 502 `rejected` | — |
| AT5 | `initiating` | Timeout, dropped connection, 5xx, unreadable reply, or a stale row (A4) | None | `unknown` | T2, CAS (or the job) | Yes | 502 `unavailable`: "We couldn't confirm this payment yet. Please check its status before trying again." | `reconcile_checkouts` |
| AT6 | `unknown` | Same-reference re-initialise returns 200 (hold valid) | Link | `open` (or `closed` if the re-check fails) | Like T2 | As AT2 or AT3 | The link, or the AT3 error | — |
| AT7 | `unknown` | Same-reference re-initialise returns `duplicate_reference` | A duplicate reply, **then** a verify of the reference (OD7) | Per OD7: `success` goes to settlement (AT11, AT12 or AT13); `abandoned` or `failed` with no link goes to `orphaned`; in progress or contradictory stays `unknown` | Verify outside any transaction, then CAS | Yes | Unchanged | `checkout_unresolved` if it's in progress or contradictory |
| AT8 | `unknown` | Still ambiguous, or "not found" | None that decides | stays `unknown` | — | Yes | Unchanged | Backoff (A9); `checkout_unresolved` when the window ends |
| AT9 | `open` | Verify returns `data.status = failed` | Authoritative (OD3 rules 1–2) | `failed` | Verify outside; CAS from `open` under the locks, and only if nothing has succeeded | Yes | "This payment didn't go through. If your account was charged, we'll apply or refund it." (proposed wording) | — |
| AT10 | `failed`, `rejected` or `orphaned` | The family asks to pay again (OD3 rule 9) | Verify of every earlier attempt shows nothing successful or potentially successful | The old attempt is unchanged; a new `initiating` row is created (AT1) | T1 | Old: yes | As AT1 | `checkout_unresolved` when the cap is reached |
| AT10a | `unknown` (moved from `initiating` by AT14 or AT16), or `closed` | A **late** initialise reply arrives: HTTP 200 with a link | Link and reference | `closed` (`superseded` or `hold_ended`). The link and reference are stored for monitoring and **never returned** | T2: placement → payment; compare-and-set from the state actually found (`unknown` or `closed`), never from `initiating`. The placement is never reopened | Yes | The caller gets the AT3 error for the placement's current state (409 `HOLD_EXPIRED`, `ILLEGAL_TRANSITION` or `REQUEST_NOT_OPEN`) | — |
| AT10b | `unknown`, or `closed` without a link | A **late** definite 4xx that isn't `duplicate_reference` | Parseable 4xx with `code` | `rejected` **only** after A3's same-reference confirmation. That confirmation is a re-initialise, so it's allowed only while the placement is `pending_payment` with a valid hold. For an expired, paid or otherwise ineligible placement, no re-initialise is made (section A, "After the hold ends"): the attempt stays `unknown` and is reconciled by verify only | As AT10a | Yes | Unchanged | — |
| AT10c | `unknown`, or `closed` without a link | A **late** `duplicate_reference` | A duplicate reply, then a verify (OD7) | As AT7 | As AT7 | Yes | Unchanged | As AT7 |

**Successful payments:**

| # | From | Trigger | Provider evidence | To | Transaction and locks | Monitored? | Family sees | Alert or reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AT11 | `open`, `unknown`, `failed`, `orphaned`, `rejected` or `closed` | Verified success; placement `pending_payment`; hold valid at `clock_timestamp()`; no sibling `succeeded` | Verify `data.status = success`, matching reference, amount and currency | `succeeded`; placement `pending_payment → trial` | Settlement (section B): placement → payment; I2 and I11 back it; **siblings moved by AT14 in the same transaction** | — | "Payment confirmed. The trial has started." | — |
| AT12 | As AT11 | Verified success, but the hold has expired or the placement is `cancelled` | As AT11 | `refund_due`, plus a `payment_refunds` row (`requested`) | Settlement; the placement is **not** changed | — | "Your hold expired before your payment was confirmed, so the worker wasn't reserved. Your payment will be refunded." (proposed) | `late_payment` alert, until the refund is `processed` |
| AT13 | As AT11 | Verified success, but the placement is already `trial` or later, or a sibling is `succeeded` (a duplicate) | As AT11 | `refund_due`, plus a `payment_refunds` row | Settlement; if I2 is violated, retry in a fresh transaction (section G) | — | "We received a second payment for this placement. It will be refunded." (proposed) | `duplicate_charge` alert, until the refund is `processed` |
| AT14 | Siblings in `initiating`, `open` or `unknown` | AT11 applies a payment | — | `open` → `closed` (`superseded`); `initiating` → `unknown`; `unknown` unchanged | The AT11 transaction | Yes, all | — | Any later success is handled by AT13 |

**Hold expiry and refunds:**

| # | From | Trigger | Provider evidence | To | Transaction and locks | Monitored? | Family sees | Alert or reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AT15 | `open` | The hold expires (`expire_holds`, or R2 in accept) | — | `closed` (`hold_ended`) | The hold-release transaction (placement → payment) | Yes | `hold_expired_family` notice; accept again (OD2) | — |
| AT16 | `initiating` | The hold expires | — | `unknown` (no initialise after the hold ends; reconciled by verify only) | As AT15 | Yes | As AT15 | `reconcile_checkouts` |
| AT17 | `unknown`, `failed`, `orphaned`, `rejected` or `closed` | The hold expires | — | Unchanged (already inactive) | As AT15 | Yes | As AT15 | — |
| AT18 | `refund_due` | The refund lifecycle reaches `processed` for the full amount owed | Refund confirmed `processed` (section D) | `refunded` | Refund transaction: payment → refund | — | "Refund completed. It can take up to 10 working days to reach your account." (proposed; only on `processed`) | The alert resolves with a system note |
| AT19 | `refund_due` | A refund fails, needs attention, or can't be matched | Section D | stays `refund_due` | — | — | "Your refund needs attention; our team is handling it." (proposed) | `refund_attention`, `refund_stuck` or `refund_admin_review` |

On the wire (`GET /payments`, `GET /payments/{reference}/verify`), the contract's values
(`pending|success|failed|refunded`, `api-contracts.md` §4) map as follows:
- `initiating`, `open` and `unknown` show as `pending`;
- `rejected`, `failed`, `orphaned` and `closed` show as `failed`;
- `succeeded` shows as `success`;
- `refunded` shows as `refunded`;
- **`refund_due`: contract question X1, open.**

**The inconsistency behind X1** (sixth-revision audit, C3):
- The contract and the web app treat `refunded` as completed:
  - `apps/web/src/features/billing/status.ts` labels it "Refunded" in payment history;
  - `apps/web/src/types/domain.ts` defines `PaymentStatus`;
  - `api-contracts.md` §4 says a `charge.success` after the hold expired "marks the payment `refunded`".
- Mapping `refund_due` to `refunded` would show a refund as **completed before Paystack confirms
  `processed`**. That breaks the product invariant that a refund isn't shown as completed until Paystack
  confirms `processed` (OD6, section I).
- The payment callback screen already says "Your payment will be refunded", which is correct for either value.

**Recommendation (not decided):** a semantically distinct wire value, for example `refund_pending`, for
`refund_due`, alongside OD6's `refund_status`. Adding an enum value is a contract change under ADR 0009. It
needs:
- `api-contracts.md` §4, including the "marks the payment `refunded`" sentence;
- the generated types;
- `apps/web/src/types/domain.ts` and `apps/web/src/features/billing/status.ts` (a label);
- `PaymentCallbackScreen.tsx` and the family payments screen;
- the MSW payment, billing and family-request handlers, and their tests.

The alternative is keeping `refunded` on the wire and changing every client to read `refund_status`; it's
weaker, because existing clients would keep showing "Refunded". **X1 stays open until the owner decides.**
Nothing in the contract or the frontend has changed.

### A. Ambiguous initialisation

**T1** (short transaction):
1. Lock the placement and check it's `pending_payment` with a live hold.
2. If an `open` attempt exists, return its link.
3. If an attempt is `unknown`, reconcile it (below) and return 502 `PAYMENT_PROVIDER_ERROR` (`unavailable`)
   unless that produces a link. If an attempt is `initiating` (another request's call is in flight), return
   X3's conflict response (OD3 rule 7; open).
4. Otherwise insert `initiating` with a new reference and commit.

Then call initialise **with no transaction and no lock held**. **T2** locks the placement, then the payment. It
records the outcome by compare-and-set from `initiating`, then re-checks that the placement is still
`pending_payment` with a valid hold at `clock_timestamp()` (OD3 rule 8, AT2 and AT3). A link is returned only
if the re-check passes. If the compare-and-set finds the attempt no longer `initiating` (AT14 or AT16 moved it
to `unknown`, or it's `closed`), the reply is a **late reply**, handled by AT10a–AT10c. It never reopens the
placement or returns a link.

| # | What happens | Resulting state | Notes |
| --- | --- | --- | --- |
| A1 | 200 with a link | `open` | The link is returned only after T2 commits (I6) |
| A2 | We send the request and our call times out, the connection drops, or Paystack returns 5xx or an unreadable body | `unknown` | Paystack may have created the transaction (D5: no idempotency key) |
| A3 | A complete, parseable 4xx with `status: false` whose message is **not** "Duplicate Transaction Reference" | `rejected`, provisionally | Relies on U3. Before a new reference is used, reconciliation retries the **same** reference once: a 4xx again confirms `rejected`; "Duplicate Transaction Reference" makes it `orphaned`; a 200 makes it `open` |
| A4 | The process dies after T1 and before T2 | stays `initiating` | After `CHECKOUT_STALE_SECONDS` (provisional: twice the client timeout, 30 s) it's treated as `unknown` |
| A5 | Paystack stays unavailable, or keeps returning 5xx or ambiguous replies | stays `unknown` | No new reference; the family gets 502 `unavailable` while the hold is live |

**Reconciling `unknown`** (inline on the next retry while the hold is live, and by the `reconcile_checkouts` job
with backoff): re-initialise with the **same reference**, amount, email and metadata.

| # | Same-reference reply | Resulting state | Why |
| --- | --- | --- | --- |
| A6 | 200 with a link | `open` | One transaction per reference (D1, D2). Whether Paystack created it now or returned the earlier one (U1) doesn't matter: either way the reference has exactly one transaction, and we now hold its link |
| A7 | "Duplicate Transaction Reference" (`duplicate_reference`) | Decided by verifying the original reference (OD7): `success` → settlement; `abandoned` or `failed` with no link ever stored → `orphaned`; `ongoing`, `pending`, `processing`, `queued` or `reversal-pending` → stays `unknown` with an admin alert; not found or ambiguous → stays `unknown` (alert if it contradicts the duplicate reply) | D2 and O1 show a transaction exists. That doesn't prove payment, failure, or that we can recover its link (D4; O1 returned no link). We never stored a link, so none was ever shown (I6, I7) |
| A8 | Another definite 4xx | `rejected` | As A3 |
| A9 | Ambiguous again | stays `unknown` | Backoff (provisional): 30 s, 1, 2, 5, 10, then 30 minutes |

**Verify is never used to decide whether initialise succeeded.** It's used only to learn the payment state of
a transaction already known to exist (A7, OD7), or to confirm a failure (OD3). "Not found" (a 404 per D10, or
HTTP 400 `transaction_not_found` per O4) may be a read-after-write delay
(U4), and a transaction could appear later. "Not found" changes nothing. A verify that **finds** the transaction
proves it exists, but not its link (D4). So it moves `unknown` to `orphaned` only once the hold has ended and
no same-reference re-initialise will be made.

**After the hold ends, no new initialise calls are made**, because each would create another payable
transaction. A still-`unknown` attempt is then reconciled by **verify only**:
- found → `orphaned`, then watched;
- `success` → settlement (it becomes `refund_due`, since the hold has ended);
- 404 or ambiguous → stays `unknown`.

When the monitoring window ends (OD5: 7 days, provisional), a still-`unknown` attempt **remains `unknown`**. The job
raises an admin alert, `checkout_unresolved`. The admin looks the reference up in the Paystack dashboard and
records the outcome:
- not found → `rejected`;
- found unpaid → `orphaned`;
- found paid → settled through the normal path.

Until then the webhook still settles any success for it, because the row exists.

**When a new reference may be created** (for the same hold):
- only while the hold is valid; never after it has expired (OD1, OD3);
- only when no attempt for the placement is `initiating`, `open` or `unknown` (enforced by I4);
- only when the previous attempt is:
  - `rejected` (confirmed by a same-reference retry, A3);
  - `orphaned` (A7, reconciled per OD7); or
  - `failed` (authoritatively confirmed per OD3);
- and only when verifying every earlier attempt for the placement shows no successful or potentially
  successful payment (OD3 rule 3).

The evidence required is a definitive Paystack reply stored on the attempt: the HTTP status, Paystack's
`message`, and its `meta.nextStep` if present. A timeout, a 5xx or a 404 is never enough.

A new hold (R2) always starts a new attempt. Older attempts stay `closed` or `orphaned` and are watched.

**A link that was created but never reached us or the family** is either:
- `orphaned`, when a duplicate-reference reply reveals it; or
- `unknown`, when nothing does.

Either way it's watched, so if it's ever paid, the payment becomes `refund_due`. Under U7, nobody holds that
link, so payment is improbable but **not proven impossible**.

### B. Late payments, expired holds and placement invariants

**One settlement routine** serves every success entry point: the webhook, the browser return (section E,
"Entry points"), `reconcile_checkouts`, `watch_checkouts`, and retries.
1. Verify the reference outside any transaction. On a timeout or a 5xx nothing changes: the webhook answers
   502 so Paystack redelivers (D9), and a job tries again next run.
2. In one transaction, lock the placement, then the payment.
3. Re-read both. If the payment is `succeeded`, `refund_due` or `refunded`, stop (idempotent).
4. Only `data.status = success` with the matching amount and currency counts. Anything else leaves the attempt
   as it is, except AT9's authoritative `failed`. `reversal-pending` and `reversed` are never a success to apply
   (OD9 item 3).
5. Read `clock_timestamp()` under the lock (OD1). **Apply** (AT11) only if:
   - the placement is `pending_payment`;
   - `hold_expires_at > clock_timestamp()`;
   - no sibling attempt is `succeeded`.

   In that case, in this one transaction:
   - the payment becomes `succeeded` by compare-and-set from its current state;
   - the placement goes `pending_payment → trial` through the state machine;
   - the siblings move per AT14.

   I2 and the transition trigger (I11) back this in the database. If either rejects the write, the transaction
   is rolled back and settlement re-runs once in a fresh transaction (section G), where the payment takes step 6.
6. **Otherwise** (AT12 or AT13), in the same transaction:
   - the payment becomes `refund_due`;
   - a `payment_refunds` row is inserted (`requested`, for the payment's captured amount);
   - a `late_payment` or `duplicate_charge` alert is raised;
   - the family is notified.

| Situation | Outcome | Enforced by |
| --- | --- | --- |
| Paid after the hold expired (before or after `expire_holds` ran) | `refund_due`; the placement isn't revived and no trial starts (AT12) | Step 5's clock check, I11, I3 (ADR 0014 §3) |
| Paid after the worker or request was placed elsewhere | As above. Reviving would also violate I1, which the database refuses | I1, I3 |
| Two attempts succeed for one placement | The first to commit is `succeeded`; the second is `refund_due` with a `duplicate_charge` alert (AT13) | I2 |
| A `failed` attempt later succeeds (T8 hosted page untested) | Applied if step 5 allows; otherwise `refund_due` (AT11 or AT13) | Steps 3–6, I2 |
| Webhook and reconciliation job settle the same reference concurrently | The placement and payment locks serialise them; the second sees the final state and stops | Locks, step 3 |
| Placement already credited (`trial` or later) when another payment succeeds | `refund_due` with a `duplicate_charge` alert | I2, step 5 |
| A success for a reference with no row | Recorded as an unmatched charge, with an open `unmatched_charge` alert; nothing is granted | I10 |

The hold check in step 5 means a payment that lands after `hold_expires_at`, but before `expire_holds` has
run, is **not** applied. Today's code applies it if the placement is still `pending_payment`. This deliberate
tightening is owner decision OD1 (approved as design direction; it decides Q2). The family must accept again,
and the late payment is refunded through the lifecycle in section D.

### C. Webhook idempotency

- **Kept:** signature first, on the raw body; the event row is inserted or fetched under
  `uq_webhook_events_provider_event_id`.
- **New:** settlement and refund updates are idempotent under row locks, so concurrent or repeated deliveries
  have one effect. Nothing relies on the event table alone.
- **New event types handled:** `refund.processing`, `refund.needs-attention`, `refund.processed` and
  `refund.failed`. Each is matched to a refund by Paystack's refund ID if stored, otherwise by the transaction
  reference (U6), and is confirmed with `GET /refund/{id}` before the state changes.
- **Unknown events** are acknowledged with 200, as today.

### D. Refund lifecycle

Rewritten in the sixth revision. None of this exists in code today (see "Built today": `refund_sent_at`,
`refund_attempts`, `_send_refund`).

**An accepted refund request is not a completed refund.** Only `processed`, confirmed as R-f says, completes
one (O5: an accepted refund stayed `pending`, with an expected date days away).

#### Refund data model (replaces revision 3's one-row-per-payment model)

- **`payment_refunds`:** several rows per payment are allowed, so a refund that Paystack failed (money credited
  back, D12) or declined can be followed by a legitimate new attempt.
- **Each row:**
  - `amount_kobo`, with a single-table `CHECK (amount_kobo > 0)`;
  - `status`;
  - `paystack_refund_id`, nullable and unique when present;
  - the transaction reference;
  - `submitted_at`;
  - the last provider evidence (status, `code`, time);
  - `resolution_note`.
- **Aggregate invariant:** the sum of `amount_kobo` over a payment's **committed** refunds (every state except
  `provider_failed`, `provider_declined` and `voided`) must not exceed the payment's **captured amount**.
- **One lock order for every refund operation** (sixth-revision audit, C2):
  1. lock the payment row (`SELECT … FOR UPDATE`);
  2. lock or modify the refund row;
  3. recalculate and enforce the aggregate.

  This applies to reservations (RT1), status updates (RT2–RT13), retries, provider-result handling (webhooks,
  fetches, the recovery algorithm) and admin resolutions. **No path locks a refund row and then its payment
  row.** A refund update that starts from a refund ID first reads its `payment_id` without a lock, then locks
  the payment, then re-reads and locks the refund.
- **Database enforcement (superseded in implementation: migration 0008 uses a counter column,
  `payments.refund_committed_kobo`, kept by a trigger and bounded by a `CHECK`, instead of the summing trigger
  described here; see "Implementation status"):**
  - **The trigger:** a `CONSTRAINT TRIGGER … AFTER INSERT OR UPDATE OF amount_kobo, status ON payment_refunds
    … NOT DEFERRABLE`. It acquires the parent payment row lock (`SELECT … FOR UPDATE`) **before** it re-sums
    the committed refunds, and raises if the sum exceeds the captured amount. `NOT DEFERRABLE` means a
    violation surfaces at the statement, not at commit.
  - **Isolation:** the design assumes READ COMMITTED (the project default; database.md §7). There, a statement
    that runs after a lock wait sees rows committed by the transaction it waited for. Under REPEATABLE READ or
    SERIALIZABLE, the re-sum after a lock wait would instead fail with a serialisation error (`40001`), which
    the retry rule handles (section G).
  - **Immutable captured amount:** a payment's captured `amount_kobo` must not change after capture. This is
    enforced by a trigger that rejects updates to it once the payment is `succeeded`, `refund_due` or
    `refunded`.
- **Defence in depth, not a single guarantee.** The application path (lock the payment, sum, insert or update
  the refund, all in one transaction) and the trigger together are what keep concurrent reservations from
  over-committing. **The trigger alone isn't claimed to guarantee concurrency safety.** Serialisation failures
  (`40001`), deadlocks (`40P01`) and the trigger's violation (`P0001`, hint `REFUND_EXCEEDS_CAPTURE`) roll back
  and are handled by section G's bounded fresh-transaction retry. A repeated violation raises
  `refund_admin_review`.
- **Needs technical verification before implementation:** the PostgreSQL behaviours this relies on, namely:
  - READ COMMITTED's statement-level snapshot after a lock wait, inside a PL/pgSQL trigger;
  - constraint-trigger timing with `NOT DEFERRABLE`;
  - the lock-then-sum ordering under concurrent inserts.

  They should be verified by a concurrency test (two transactions reserving against one payment) before
  they're relied on. They're stated from PostgreSQL's documented semantics, not tested in this project.
- A cross-table `CHECK` isn't possible in PostgreSQL, so none is proposed.
- **Outstanding commitments vs completed refunds:**
  - outstanding means committed but not `processed`;
  - completed means `processed`;
  - the payment is `refunded` only when its `processed` total equals the amount owed back. That's the full
    captured amount for a late or duplicate payment (AT12 and AT13); any other amount depends on the owner's
    policy.
- **Parallel submissions:** at most one row per payment in `submitting` or `uncertain` (I9, a partial unique
  index).
- **Partial and repeat refunds** as a customer-facing policy are **awaiting the owner** (`docs/owner-inputs.md`
  #7d; `docs/pricing.md` F1). The model allows them, but the design doesn't decide them. Late and duplicate
  payments (AT12, AT13) are refunded in full.

#### Refund states

| State | Meaning | Counts toward the aggregate? | Terminal? |
| --- | --- | --- | --- |
| `requested` | Committed; **no request has ever been sent** for this row | Yes | No |
| `submitting` | Committed **before** the external call; the call is in flight, or the process died during it | Yes | No |
| `uncertain` | The call was made (or may have been) and its outcome isn't established: timeout, 5xx, unreadable reply, a stale `submitting`, or `transaction_reversed` (OD8) | Yes | No |
| `pending` | Paystack accepted it (refund ID stored), or reports `pending` (D12) | Yes | No |
| `processing` | Paystack reports `processing` | Yes | No |
| `needs_attention` | Paystack reports `needs-attention` (customer bank details needed, D12) | Yes | No |
| `admin_review` | Reconciliation can't establish a reliable match or status; manual Paystack dashboard review is needed | Yes | No |
| `processed` | Paystack confirmed `processed` (R-f) | Yes | **Yes**, completed |
| `provider_failed` | Paystack reports `failed`: the money was credited back to our balance (D12). Not the same as an attempt's `failed` | No (released) | Yes |
| `provider_declined` | A definite 4xx refusal of the create request that isn't `transaction_reversed`, for example `declined` (O7) | No (released) | Yes |
| `voided` | A `requested` row cancelled before any call was made (for example, an admin resolved the payment another way) | No (released) | Yes |

#### Refund transitions

| # | From | Trigger | Evidence | To | Transaction and locks | Alert |
| --- | --- | --- | --- | --- | --- | --- |
| RT1 | — | Settlement routes a payment to `refund_due` (AT12, AT13), or an admin starts a refund under the owner's policy | — | `requested` | The settlement transaction (placement → payment → refund), or payment → refund with the aggregate check | `late_payment` or `duplicate_charge` |
| RT2 | `requested` | `refund_retry` picks it up | — | `submitting` | Payment → refund lock; CAS; **commit before the call** | — |
| RT3 | `submitting` | Paystack 200 | Refund ID and status | `pending` or `processing` | Payment → refund; CAS | — |
| RT4 | `submitting` | Timeout, 5xx, unreadable reply, or a stale `submitting` (process died) | None | `uncertain` | Payment → refund; CAS | — |
| RT5 | `submitting` | 400 `transaction_reversed` | Evidence that **a** refund may exist (O6), not that this one completed | `uncertain` | Payment → refund; CAS | — |
| RT6 | `submitting` | Another definite 4xx (for example `declined`) | Parseable 4xx with `code` | `provider_declined` | Payment → refund; CAS; the aggregate is re-checked (released amount) | `refund_attention` |
| RT7 | `uncertain` | Reconciliation finds exactly one match | Recovery algorithm below | That refund's mirrored state (`pending`, `processing`, `needs_attention`, `processed`, `provider_failed`) | Payment → refund; CAS; refund ID stored | — |
| RT8 | `uncertain` | No reliable match, several matches, contradictory evidence, or the threshold passes | — | `admin_review` | Payment → refund; CAS | `refund_admin_review` |
| RT9 | `uncertain` | Reconciliation shows no refund exists, **and** automatic resubmission is enabled (gate below) | Two clean checks, below | `submitting` (one resubmission per row, recorded) | Payment → refund; CAS | — |
| RT10 | `pending` or `processing` | Paystack reports a change (a verified `refund.*` webhook, confirmed with `GET /refund/{id}`, or the job's fetch) | Refund ID and status | `processing`, `needs_attention`, `processed` or `provider_failed` | Payment → refund; CAS; the aggregate is re-checked | `refund_attention` for `needs_attention` or `provider_failed` |
| RT11 | `needs_attention` | An admin supplies bank details in the Paystack dashboard; Paystack then reports progress | As RT10 | As RT10 | Payment → refund; CAS | Stays open until `processed` |
| RT12 | `admin_review` | An admin records a resolution note: (a) the matched refund ID and its status, or (b) "no refund exists at Paystack" | The admin's dashboard check, recorded | (a) the mirrored state; (b) `voided`, with a new `requested` row allowed | Payment → refund; CAS; audited; the aggregate is re-checked | Resolved only with a note |
| RT13 | `pending`, `processing`, `uncertain` or `needs_attention` | Non-final past the escalation threshold (R-e) | — | Unchanged | No refund-row change; alert raised under the alert's unique index | `refund_stuck` |

Every row follows section D's single lock order: payment, then refund, then the aggregate check, then any
alert.

`reversal-pending` on the **transaction** (O5) is non-terminal evidence that a refund is under way. It never
moves a refund to `processed`.

#### Recovery algorithm for an `uncertain` refund

1. **If a refund ID is stored,** fetch it (`GET /refund/{id}`, D13) and mirror its status (RT7). Stop.
2. **Collect candidates** from:
   - signed `refund.*` webhook events stored for this transaction's reference (their body contents are
     unverified, U6);
   - `GET /refund` over a time window around `submitted_at`. That endpoint has date and page parameters (D13),
     but **paging, timestamp semantics and filtering are subject to provider verification**. No filter by
     transaction is documented, so filtering happens on our side.
3. **A candidate matches** only if all of these hold (field presence observed in test mode only, O7):
   - its `transaction_reference` equals ours (or its transaction ID equals ours);
   - its amount equals this row's `amount_kobo`;
   - it isn't already linked to another of our refund rows.
4. **Exactly one match:** store its ID, then mirror its status (RT7).
5. **Several matches, or contradictory evidence:** `admin_review` (RT8).
6. **No match:**
   - stay `uncertain` and check again after a provisional interval (15 minutes);
   - a transaction `reversal-pending` or `reversed` (O5, D7) counts as contradictory evidence: go to
     `admin_review`;
   - after two clean checks, resubmit **only if the automatic-resubmission gate is open** (RT9); otherwise, or
     once past the threshold, go to `admin_review`.
7. **Automatic-resubmission gate: closed until** live-mode verification, or Paystack's confirmation, of two
   things:
   - that refund listing reliably exposes the transaction reference and can be paged exhaustively;
   - that a duplicate full refund is refused (O6 is test mode only).

   Opening the gate is an owner decision (`docs/owner-inputs.md` #13a). While it's closed, unmatched uncertain
   refunds always go to manual review.
8. **Manual review:** the admin checks the Paystack dashboard and records a resolution note (RT12). Alerts stay
   open until resolved, not merely acknowledged (OD4).

| # | Situation | Behaviour |
| --- | --- | --- |
| R-a | A refund request times out after Paystack may have processed it | `uncertain` (RT4). **Not re-sent** without the recovery algorithm |
| R-b | The refund succeeded but its response was lost | Same as R-a; found by reconciliation (RT7), or `admin_review` |
| R-c | Resolving `uncertain` | The recovery algorithm above |
| R-d | A refund is declined, fails, or needs attention | `provider_declined`, `provider_failed` or `needs_attention`, with an open `refund_attention` alert. The payment stays `refund_due` (an explicit unresolved state). A new `requested` row is allowed after `provider_declined` or `provider_failed`, within the aggregate |
| R-e | A refund never resolves | Escalation thresholds (provisional): 24 hours for `uncertain`; 5 business days for `pending` or `processing`, since D12 allows up to 10 business days for the customer's bank. `refund_stuck` is raised |
| R-f | Marking a refund done | Only `processed`, confirmed by `GET /refund/{id}` (or a verified `refund.processed` webhook confirmed by that fetch), counts as completed. Paystack accepting the request, `transaction_reversed`, or `reversal-pending` is never enough |

### E. Reconciliation jobs (proposed; all intervals provisional)

All jobs follow ADR 0015: a Redis lock per job, safe to run late or twice, `SKIP LOCKED` sweeps, and settlement
or refund changes only through the routines above.

| Job | Every | Does | Gives up or escalates |
| --- | --- | --- | --- |
| `reconcile_checkouts` | 1 minute | Resolves `initiating` (stale) and `unknown` attempts (section A; AT5–AT8, AT16) | Backoff as A9; `checkout_unresolved` at the end of the monitoring window |
| `watch_checkouts` | 15 minutes for 24 hours after an attempt becomes inactive, then hourly until its `watch_until` (**provisional**) | Verifies `open` (after the hold ends), `closed`, `failed`, `orphaned`, `rejected` and `unknown` attempts, and passes any success to the shared settlement routine | Stops at `watch_until`. The webhook still settles later successes for any stored reference |
| `refund_retry` (extended) | 15 minutes (as today) | Moves `requested` → `submitting` and calls Paystack (RT2), runs the recovery algorithm for `uncertain` (RT7–RT9), refreshes `pending`, `processing` and `needs_attention` (RT10) | Raises `refund_attention`, `refund_stuck` or `refund_admin_review`; no blind resubmission |

**Entry points** (all are implementation requirements; none of these jobs exists today):
- **Webhook `charge.success`, the browser return, both jobs and retries** all call the **same settlement
  routine** (section B). No entry point can bypass the hold-expiry rule (OD1) or idempotency (step 3).
- **The browser return** (`GET /payments/{reference}/verify`, today `PaymentService.verify_for_payer`) treats
  the callback only as a prompt to verify server-side. It never trusts its query parameters, and it never
  applies anything itself.
  - Today it settles only when the payment is `pending`.
  - In the target it settles any attempt that can still receive a success: `open`, `unknown`, `closed`,
    `failed`, `orphaned` and `rejected`.
  - It returns the state as re-read from the database.
- **Monitoring** covers `closed`, `failed`, `orphaned`, `rejected` (U3 is only partly observed) and `unknown`
  until `watch_until`.
- **After `watch_until`**, webhook events for any stored reference still trigger settlement. The window is a
  backstop, not proof that a hosted link has expired (OD5; T2 untested).
- **Persistent alerts** are raised for:
  - unknown outcomes (`checkout_unresolved`);
  - late and duplicate charges (`late_payment`, `duplicate_charge`);
  - failed refunds (`refund_attention`);
  - stuck refunds (`refund_stuck`);
  - unmatchable refunds (`refund_admin_review`);
  - payments with no row (`unmatched_charge`);
  - settlements that fail after their retry (`settlement_failed`).

**On the intervals:** they are **provisional and not evidence-based**. Paystack documents no link lifetime
(U2 is unverified), and an unpaid link may stay payable indefinitely (D6, D7). The watch job is only a backstop
for missed webhooks. Paystack retries `charge.success` deliveries for 72 hours in live mode (D9), so a window
shorter than that adds little, and successes after the window still settle through the webhook.
OD5 sets the window at 7 days, provisionally; T2 (untested) informs it, but can't prove an upper bound.

### F. Admin alerts (proposed; direction approved as OD4)

The admin console gets an alert list: view, acknowledge, and resolve with an explanatory note (OD4).
**Acknowledging an alert doesn't resolve it**, and resolving a refund alert doesn't make the refund complete
unless it's confirmed `processed`. Refunds are done manually in the Paystack dashboard. There's no in-app refund
button.

Besides the alerts below, OD3 and OD7 escalations (contradictory or in-progress states on an earlier attempt,
or the attempt cap) raise `checkout_unresolved`.

An `admin_alerts` row records:
- `kind`, the subject (payment or reference), `details`, `opened_at`, `acknowledged_by` and `acknowledged_at`;
- `resolved_by`, `resolved_at` and `resolution_note`.

A unique index permits one **open** alert per (kind, subject), so jobs can raise alerts repeatedly without
duplicates. A super admin is emailed through the notifications feed. Alerts stay open until an admin records a
resolution, which is audited (`audit_log`).

| Alert | Raised when | Admin's required action |
| --- | --- | --- |
| `checkout_unresolved` | An attempt is still `unknown` at the end of the window | Look up the reference in the Paystack dashboard; record not found, found unpaid, or found paid (settled normally) |
| `unmatched_charge` | A success arrives for a reference with no row | Identify the payer; refund it manually in the Paystack dashboard (OD4: no in-app refund button); record the refund ID on the alert |
| `refund_attention` | A refund is `needs_attention`, `provider_failed` or `provider_declined` | Supply bank details in the Paystack dashboard, or start a new refund within the aggregate; record the outcome |
| `refund_stuck` | A refund has been non-final past the threshold | Check it in the Paystack dashboard; record the refund ID and status, or escalate to Paystack support |
| `refund_admin_review` | An `uncertain` refund can't be matched reliably (RT8) | Find the refund in the Paystack dashboard; record its ID and status, or "no refund exists" (RT12) |
| `late_payment` | A success was confirmed after the hold expired (AT12) | None at first; it tracks the refund. It resolves with a system note when the refund is `processed`, or escalates through the refund alerts |
| `duplicate_charge` | A second success for an already-paid placement (AT13) | As `late_payment` |
| `settlement_failed` | Settlement fails again after its single fresh-transaction retry (section G) | Investigate. The payment evidence is kept on the attempt; nothing is granted until it's resolved |
| `legacy_unresolved` | Migration found a legacy row it can't map with enough evidence (section H) | Check it in the Paystack dashboard; record the mapping |

Alerts resolved automatically by provider evidence (for example a refund confirmed `processed`) carry a system
resolution note in `audit_log`. All other alerts need an admin's note. An acknowledged alert stays open.

### G. Locking, idempotency and retries (sixth revision)

**Existing lock order** (confirmed in code; the earlier claim of a single placement-first order was wrong):

| Path | Order today |
| --- | --- |
| `PlacementService.accept` | `requests` row (`FOR UPDATE`) → proposal (`FOR UPDATE`) → this request's lapsed placements (`expired_holds`, **`SKIP LOCKED`**) → their pending fee payments (`fail_pending_fee`, an `UPDATE`) → worker (`FOR UPDATE`, in `_hold_worker`) → this worker's lapsed placements (`SKIP LOCKED`) → their payments → **their requests** (`FOR UPDATE`, in `_release_hold`) → insert the placement |
| `PlacementService.expire_holds` | lapsed placements (`SKIP LOCKED`) → payments (`UPDATE`) → request (`FOR UPDATE`) |
| `PaymentService._settle` | placement (`FOR UPDATE`) → payment (`FOR UPDATE`) → `begin_trial_locked` (reads the request without a lock) |
| `PaymentService.start_placement_checkout` | placement (`FOR UPDATE`) → pending fee payment (`FOR UPDATE`) → **Paystack call while the locks are held** |
| `PaymentService._send_refund` | payment (`FOR UPDATE`), released before the Paystack call |

**Why there's no deadlock today** (by analysis, not tested):
- Accept takes request and worker locks before placements, the reverse of expiry and settlement.
- But accept never **waits** on a placement: it takes placements only with `SKIP LOCKED`.
- A request has at most one active placement (I1), so expiry can't hold a placement whose request another accept
  is about to lock.

**Side effect (confirmed existing behaviour):** while expiry or settlement holds a lapsed placement, accept skips
it and sees it as still active. The family gets a temporary 409:
- `WORKER_UNAVAILABLE` (another family's lapsed hold); or
- `REQUEST_NOT_OPEN` (their own lapsed hold).

*Recommendation:* the client retries the accept once, after a delay (**provisional: about 2 seconds**), with the
**same** `Idempotency-Key` (a failure isn't stored, so the retry runs again), before showing the error. This
doesn't change any code.

**Target requirements:**
1. **Placement-first paths** (checkout T1 and T2, settlement, expiry, the jobs) lock in this order: placement →
   payment → refund → alert. Request and worker rows come after the placement where they're needed.
2. **Accept-side paths** that lock request or worker first keep taking placements only with `SKIP LOCKED` (or
   `NOWAIT` with a bounded retry), and payments only through placements they already hold.
3. **No database lock across a Paystack call** (OD9 item 8). Every provider call happens between two short
   transactions.
4. **Database-enforced invariants:** I1, I2, I4 (with the attempt cap), I5, I7, I8's aggregate trigger, I9, I10
   and I11. Application checks run first, for clear errors, but correctness doesn't rely on them alone.
5. **Compare-and-set** for every state change derived from a provider call made outside a transaction:
   - re-read the attempt or refund under its locks;
   - apply the change only if it's still in the state the decision assumed (for example
     `UPDATE … WHERE id = :id AND status = 'open'`);
   - if no row is updated, re-evaluate from the new state; never overwrite it.
6. **Fresh-transaction retry, bounded:** a statement error aborts the PostgreSQL transaction. These cases roll
   back, then retry in a **new** transaction that re-reads all state:
   - SQLSTATE `23505` on I2, I4 or (`placement_id`, `attempt_no`): retried once;
   - `P0001` from I11's trigger (hint `HOLD_EXPIRED` or `ILLEGAL_TRANSITION`) or from the refund-aggregate
     trigger (hint `REFUND_EXCEEDS_CAPTURE`): retried once;
   - `40P01` (deadlock) and `40001` (serialisation): retried up to a **provisional** 3 times, with a
     **provisional** randomised back-off (jitter) between attempts.

   These counts and delays are provisional values, not approved policy (they're listed under "Provisional
   numbers"). Whatever the final values, each retry is bounded.

   If it still fails, raise `settlement_failed`, keep the provider evidence on the attempt, and answer the
   webhook with 502 so Paystack redelivers (D9). There are no unbounded loops.
7. **Error mapping:**

   | Error | Maps to |
   | --- | --- |
   | `23505` on I4, or on (`placement_id`, `attempt_no`) | A **concurrent conflict**, not the cap: one fresh-transaction retry, then X3's conflict response (open; OD3 rule 7) |
   | `23514` on `CHECK (attempt_no BETWEEN 1 AND 3)` | The attempt cap was reached: a 409 whose code is X2 (open; `CHECKOUT_ATTEMPTS_EXHAUSTED` is a placeholder) |
   | `23505` on I2 | The AT13 refund path, in the retry |
   | `P0001`, hint `REFUND_EXCEEDS_CAPTURE` | One fresh-transaction retry, then `refund_admin_review`; no refund row is committed beyond the captured amount |
   | `P0001`, hint `HOLD_EXPIRED` | The AT12 refund path in settlement; 409 `HOLD_EXPIRED` in checkout |
   | `P0001`, hint `ILLEGAL_TRANSITION` | 409 `ILLEGAL_TRANSITION` |

   Anything unmapped is a 500, logged with the request ID.
8. **Idempotent processing:**
   - webhook dedupe (`uq_webhook_events_provider_event_id`) is kept, but nothing relies on it alone: two
     simultaneous deliveries can both process (existing behaviour), so settlement and refund updates must be
     idempotent through steps 3 and 5 and compare-and-set;
   - jobs keep their Redis lock (ADR 0015) and are safe to run twice.

### H. Legacy-state mapping (migration planning; not final, not performed)

Today's statuses are `pending`, `success`, `failed` and `refunded`, with `authorization_url`, `refunded_at`,
`refund_sent_at` and `refund_attempts` (B5 and B6; ADR 0017's built code). Their meanings differ from the
target's:
- **Legacy `refunded_at` is a decision timestamp.** Today `_settle` sets it, together with status `refunded`,
  at the moment it **decides** to refund a late payment, before any refund request is made. It records the
  legacy decision timing only, and **is not evidence** that Paystack accepted or completed a refund.
- **Legacy `refund_sent_at`** records only that Paystack accepted the create-refund request (a 200). It **is not
  evidence** of completion either.
- **No legacy row maps to the target's completed refund (`processed`, or payment `refunded`) because
  `refunded_at` or `refund_sent_at` is set.** Completion needs reliable provider evidence: the refund fetched
  by ID showing `processed`, found through the recovery algorithm (section D). Without it, the row keeps an
  unresolved state and is flagged for reconciliation.
- **Legacy `failed` ≠ the target's `failed`.** Today `fail_pending_fee` sets `failed` when a hold is
  released, and `start_placement_checkout` sets it on a pre-ADR-0017 pending row that never got a link. Neither
  is a provider-confirmed failure.
- **Legacy `refunded` ≠ a processed refund.** Today `_settle` sets it when a refund is *decided*. A set
  `refund_sent_at` means only that Paystack accepted the request.
- **Legacy refund failures** exist only as logs (`payment.refund_failed`, `payment.refund_gave_up`), not as
  states.

**Proposed mapping, for review** (placement-fee payments; subscription payments are out of scope and keep
their meaning):

| Legacy row | Proposed target | Note |
| --- | --- | --- |
| `pending`, link stored, placement `pending_payment` with a valid hold | `open` | — |
| `pending`, link stored, placement not eligible | `closed` (`hold_ended`), monitored | Shouldn't exist (`_release_hold` fails pending fees); if found, `legacy_unresolved` |
| `pending`, no link | `unknown`, reconciled by verify only | Whether Paystack ever received it is unknown |
| `failed`, link stored | `closed` (`hold_ended`), monitored | **Never** the target `failed` |
| `failed`, no link | `unknown`, reconciled by verify only | Pre-ADR-0017 attempts; insufficient evidence. `legacy_unresolved` if still unresolved when the window ends |
| `success` | `succeeded` | If a placement has more than one, don't fail the migration: map the earliest to `succeeded`, the rest to `refund_due` with `legacy_unresolved` for admin review (an owner or implementation prerequisite) |
| `refunded`, `refund_sent_at` set (with or without `refunded_at`) | Payment `refund_due`, plus a refund row in `uncertain` (accepted, refund ID never stored) | Reconcile by the recovery algorithm; **never** the target `refunded` without a `processed` confirmation; `legacy_unresolved` until reconciled |
| `refunded`, `refund_sent_at` null, `refund_attempts` = 0 | `refund_due`, plus a refund row in `requested` | Never sent |
| `refunded`, `refund_sent_at` null, `refund_attempts` > 0 | `refund_due`, plus a refund row in `uncertain` | Earlier attempts may have reached Paystack (timeouts); no blind resubmission |
| `refunded`, attempts at `REFUND_MAX_ATTEMPTS` | `refund_due`, plus a refund row in `admin_review` | `refund_admin_review` |

**Before the migration:**
- The mapping is a proposal; the ambiguous rows (no link; several successes) are an implementation prerequisite
  for owner review.
- Every row mapped to an unresolved state gets an alert, and nothing is marked complete without provider
  evidence.
- The downgrade must refuse while unresolved refund or alert rows exist (see "Consequences").

### I. Family-facing payment wording (proposed, awaiting owner approval)

The copy below is a product decision (`docs/owner-inputs.md` #7d), **not yet approved**. *(Reconciled
2026-10-25: `a6f1a3a` and `9169985` use this wording provisionally, marked `TODO(content)` in
`lib/error-messages.ts`, `PaymentCallbackScreen.tsx`, `features/admin/status.ts` and
`notifications/messages.py`, pending the owner's approval.)*

| Situation | Proposed wording |
| --- | --- |
| Outcome uncertain (AT5, AT8) | "We couldn't confirm this payment yet. Please check its status before trying again." |
| Attempt confirmed failed (AT9) | "This payment didn't go through. If your account was charged, we'll apply or refund it." |
| Hold expired, nothing paid (OD2) | "Your hold on {worker} expired. Accept again to place a new hold." |
| Paid after the hold expired (AT12) | "Your hold expired before your payment was confirmed, so the worker wasn't reserved. Your payment will be refunded." |
| Duplicate payment (AT13) | "We received a second payment for this placement. It will be refunded." |
| Refund requested, submitting, uncertain, pending or processing | "Refund in progress. We'll let you know when it's confirmed." |
| Refund needs attention, admin review, provider failed or declined | "Your refund needs attention. Our team is handling it." |
| Refund `processed` **only** | "Refund completed. It can take up to 10 working days to reach your account." |

**Never shown** unless reliably established:
- "You were not charged";
- "Refund completed", before `processed`.

### Duplicate charges: guarantee and residual risk

**Guaranteed by the design:**
- At most one payment is applied per placement (I2).
- No trial starts twice (I3).
- Rule 2 holds (I1).
- One transaction exists per reference (I5).
- A family never holds two **active** links for the same hold at once (I4, I6). After an authoritative failure
  (OD3), a new link may be issued, while the old reference stays monitored (OD3 rule 6). At most three attempts
  are made per hold, if the cap is approved.
- No placement is moved into `trial` after its hold expired (OD1, I11).
- Every unapplied real payment is tracked until its refunds are `processed`, or stays visibly unresolved with an
  open alert (I8, I10). Refunds can't exceed the captured amount (I8's aggregate trigger) or be submitted in
  parallel while uncertain (I9).

**Not guaranteed (the documentation can't support it):**
- **A family charged only once.** A link from an earlier hold can be paid after a new hold is paid, or a
  bank-transfer or USSD payment can land after the hold lapses (D6, D7). Each is a real second charge.

**Recovery path:** `refund_due`, then the refund lifecycle, then `refunded`, or an open alert with a required
admin action.

**Residual exposure:**
- refund delay (up to 10 business days to the customer, D12);
- refunds that fail or need bank details;
- chargebacks.

**Mitigation:** card-only placement fees are the proposed launch direction (OD3), subject to confirming the
Paystack configuration before production billing.

## Idempotency replay rule (proposed)

**ADR 0013 §9 today:** keys for accept, confirm and `/pay` (api-contracts.md §1; `run_once`) are stored per
user, operation and key for 24 h, successful responses only. A repeat returns the stored body with
`Idempotent-Replay: true`.

**Proposed amendment** (a contract change under ADR 0009; storage is unchanged):
- **One key per user action.** A key identifies one press of "Accept" or "Pay now", reused only for automatic
  retries of that press. A new press needs a new key.
- **Liveness check before replaying accept or `/pay`:**
  - hold live and the stored attempt still `open`: replay the stored body unchanged;
  - hold live but the attempt changed: the current checkout for the same hold, marked `Idempotent-Replay: true`;
  - hold ended unpaid: 409 `HOLD_EXPIRED` (OD2), with
    `details.placement_id` and `details.status`;
  - paid: 409 `REQUEST_NOT_OPEN`, with `details.placement_id`.
- **Confirm is unchanged.**
- **How clients detect an expired hold:** `hold_expires_at` is in every `PlacementOut` (verified: API schema
  and generated types). `GET /placements/{id}` is authoritative.

## Demo seed (built)

`app/scripts/seed.py` writes rows directly (the demo needs past history). Safeguards in place, verified:
- It refuses unless `APP_ENV` is `development` or `test`.
- It refuses a database that already has users, unless `--reset` is passed.
- Passwords come from `SEED_DEMO_PASSWORD` and `SEED_ADMIN_PASSWORD`, never from code, and it refuses when
  they're missing.
- Everything is written in one transaction.
- PostgreSQL enforces rules 1 and 2 (`workers_listing_gate`, `placements_one_active_per_*`).
- `tests/integration/test_seed.py` covers these.

Service-level checks are bypassed, so the seed must never run against a deployed database. When the target
design lands, seeded payments must use the new states, and I2 and I7 then guard them too.

## Relation to earlier ADRs

- **ADR 0013 §3** said that Paystack is called outside the accept transaction. The target restores that intent
  (no lock during the call); the built checkout departs from it today.
- **ADR 0013 §9** (idempotency): storage is unchanged. The replay liveness check and one-key-per-action rule
  are added. **Amended** once accepted.
- **ADR 0014 §3** (late payments refunded): kept, and extended:
  - "refunded" splits into `refund_due` and `refunded`;
  - refunds are tracked to `processed`, with alerts;
  - late payments are no longer applied after `hold_expires_at` (OD1).
- **ADR 0014 §4** said that a pending payment that never reached Paystack is marked `failed` and a new reference
  is used. **Superseded:** attempts are never deleted. Ambiguous ones are reconciled with the same reference,
  and a new reference needs a definitive reply. "One checkout per hold" and "`/pay` returns the same checkout"
  are kept (I4).
- **ADR 0014 §5** (lock order placement, then payment): kept and extended to refund, then alert.
- **ADR 0015** (jobs): adds `reconcile_checkouts` and `watch_checkouts`, and extends `refund_retry`. Admin
  alerts are delivered through the notifications feed.
- **ADR 0009** (contract freeze): the changes below follow its rule, with the contract, mock and tests updated
  together.

## Contract and test changes required (when implemented)

*Reconciled 2026-10-25:* `9169985` and `a6f1a3a` updated `api-contracts.md`, the generated contracts, the
mocks and the tests. Two required items are still missing: the ADR 0009 amendment naming the affected
screens and mock handlers, and Playwright against the real API (B7). For the remaining test gaps, see
"Implementation status".

**`api-contracts.md`:**
- **§1:** the one-key-per-action rule and the replay liveness check.
- **§2:**
  - `PAYMENT_PROVIDER_ERROR` details (`reason`, and from accept `placement_id` and `hold_expires_at`);
  - a new `409 HOLD_EXPIRED` row, with `details.placement_id` and `details.status` (OD2).
- **§4:**
  - accept: R1–R4 and the replay rule;
  - `/pay`: the open attempt's link; 502 `unavailable` while an attempt is `unknown`; X3's conflict response
    (open) while another attempt is `initiating`; 502 `rejected`; a new
    attempt after a confirmed `failed` one while the hold is valid (OD3); 409 `HOLD_EXPIRED` for an expired
    hold (OD2); 409 `ILLEGAL_TRANSITION` when there's nothing to pay;
  - the payment wire-status mapping, including `refund_due`'s wire value (X1, open: `refund_pending`
    recommended), and the additive `refund_status` field on payment payloads (OD6);
  - new admin-alert endpoints in the admin console: list, acknowledge, and resolve with a note (OD4). There's
    no refund endpoint;
  - OD3 rule 8's T2 responses: 409 `HOLD_EXPIRED`, `ILLEGAL_TRANSITION` from `/pay`, or `REQUEST_NOT_OPEN` from
    accept, with no link;
  - if the attempt cap is approved, a new 409 for `23514` (X2, open; `CHECKOUT_ATTEMPTS_EXHAUSTED` is a
    placeholder). As a new error code, it needs an ADR 0009 amendment naming the affected screens
    (`FamilyRequestDetailScreen.tsx`'s accept and pay flow), `error-messages.ts`, and the MSW accept and `/pay`
    handlers;
  - X3's internal-conflict response (open), with the same ADR 0009 requirements;
  - the alert kinds of section F.

**Generated types:** regenerate with `pnpm contracts:generate`; CI's `contracts` job fails on a diff.

**`docs/swagger-test-plan.md`:**
- PR16: the 502 `details`.
- PR17 (same key, hold live): 201 with the same placement and link (was 409).
- New cases:
  - PR17a: a new key while the hold is live gives the same placement, with `hold_expires_at` unchanged;
  - PR17b: after a lapse, using a 1-minute `PAYMENT_HOLD_MINUTES` in the local `.env` for that run only, gives a
    new hold, or `WORKER_UNAVAILABLE`;
  - PR17c: PR16's key after the lapse gives 409 `HOLD_EXPIRED`;
  - PR17d: accepting a paid placement gives 409 `REQUEST_NOT_OPEN`.
- PY1: the 502 `details`. PY1a: `/pay` twice gives the same link.
- Known issues 2 and 3: marked fixed only once implemented and passing.

**API tests:**
- **`test_paystack.py`:** classify the outcomes by `code` (OD9): A1–A3, A7 (`duplicate_reference`), A9, both
  "not found" forms, `transaction_reversed`, `reversal-pending`; definitive versus ambiguous for refunds.
- **`test_checkout_attempts.py` (new):**
  - no lock is held during the call;
  - A2 → `unknown`, and the same reference is reused;
  - A3's confirmation retry;
  - A7 decided by verifying the original reference (OD7: each status branch), and a new reference only after
    a terminal failed state;
  - OD3: a verified `failed` closes the attempt and allows a new one while the hold is valid. Never on a browser
    error, the callback parameters, "not found", `abandoned` or an ambiguous reply. Never after the hold expires.
    A potentially successful earlier attempt blocks it. A later success on the `failed` reference is settled
    once;
  - A4 stale `initiating`;
  - "not found" (either form) never changes state;
  - no initialise after the hold ends;
  - concurrent `/pay` calls make one initialise;
  - I6 (no link before commit);
  - the hold is never extended;
  - `/pay` on an expired hold returns 409 `HOLD_EXPIRED` (OD2).
- **`test_paystack_webhook.py`:**
  - every row of the section B table;
  - a repeated event;
  - two concurrent deliveries;
  - a non-success status;
  - an amount mismatch;
  - `refund.*` events.
- **`test_refunds.py` (new):** R-a to R-f. No re-send while `uncertain`; one re-send only after two clean list
  checks; `transaction_reversed` → look up and track the existing refund (OD8); `refunded` and a completed
  `refund_status` only on `processed` (OD6).
- **`test_admin_alerts.py` (new):** one open alert per subject; view, acknowledge, resolve with a note, all
  audited; acknowledging doesn't resolve (OD4).
- **Settlement after expiry (OD1):** a success after `hold_expires_at`, before `expire_holds` has run, is
  `refund_due` and starts no trial. The transition trigger rejects `pending_payment → trial` after expiry
  (OD9 item 4).
- **`test_idempotent_replay.py` (new):** live, changed, expired, cancelled and paid replays; confirm unchanged.
- **`test_jobs.py`:** the three jobs with a frozen clock (backoff, the watch window, escalation, safe to re-run).
- **`tests/concurrency/`:** a webhook racing `watch_checkouts`; two attempts succeeding at once (I2); a
  webhook racing `expire_holds`.
- **Migration:** up → down → up. `ALTER TYPE … ADD VALUE` in `autocommit_block()`; partial unique indexes,
  CHECKs and triggers written by hand. The section H mapping is applied to seeded legacy rows, and the ambiguous
  cases raise `legacy_unresolved`.
- **Sixth-revision additions:**
  - **Clock:** the transition trigger and the settlement check both use `clock_timestamp()`. Under a frozen
    application clock and a moved database clock, a success exactly at, just before and just after
    `hold_expires_at` is decided by the database time; `paid_at` is ignored for the decision.
  - **Trigger rejection:** a trigger rejection inside settlement leads to one fresh-transaction retry and
    `refund_due`. The payment evidence is never lost.
  - **Attempt transitions:** every AT row, including AT14 sibling handling and AT3's withheld link.
  - **Attempt cap:** `attempt_no` under concurrency; the fourth attempt is refused.
  - **Refund aggregate:** concurrent refund inserts for one payment can't exceed the captured amount; a new row
    is allowed after `provider_failed` or `provider_declined`; the I9 partial unique index.
  - **Refund transitions:** every RT row.
    - `submitting` is committed before the call.
    - A crash after the call gives `uncertain`.
    - `transaction_reversed` gives `uncertain`.
    - A closed automatic-resubmission gate sends unmatched refunds to `admin_review`.
    - Exactly one match versus several matches.
    - `processed` is required for completion.
  - **`SKIP LOCKED` side effect:** accept gets a 409 while expiry holds a lapsed placement, and succeeds on
    retry.
  - **Error mapping:** each mapped SQLSTATE, and that retries are bounded.
  - **Browser return:** verify settles every eligible attempt state and never trusts query parameters.

**Kept in step with the contract (frontend, B7):**
- MSW `family-requests.ts` (accept) and `family-placements.ts` (`/pay`), with their tests;
- `error-messages.ts`: the `unavailable` and `rejected` messages, and `HOLD_EXPIRED` ("your hold expired; accept
  again", OD2);
- `FamilyRequestDetailScreen.tsx`: a new key per press, "Pay now" or "Cancel", and a hold countdown;
- family payment screens and notifications: refund "in progress", "needs attention" or "completed", from
  `refund_status` (OD6);
- the admin alert list in the admin console (OD4);
- Playwright against the real API.

**Paystack test-mode checks** (owner-authorised 2026-10-19; test keys only). Results are under "Observed in
test mode"; the remaining checks are open item 1 in "Owner decisions: status".

| # | Check | Result (2026-10-19) |
| --- | --- | --- |
| T1 | Re-initialise an unpaid reference (U1) | Run (O1) |
| T2 | An unpaid link still payable after 24 and 72 hours (U2; this can bound the window but not prove expiry) | **Not run** |
| T3 | A 4xx refusal, then verify that reference, then initialise the same reference validly (U3) | Run for two refusal types (O3) |
| T4 | Verify immediately after initialise (U4) | Run, 4 samples (O2, O4) |
| T5 | A second refund of a refunded transaction (U5) | Run, sequential only (O5, O6) |
| T6 | Refund webhook bodies and `GET /refund` items: is the transaction reference present? (U6) | **Partly run:** list and fetch (O7); webhook bodies not run |
| T7 | Does the customer receive any email with the link? (U7) | **Not run** |
| T8 | A declined card retried on the same link (U8) | **Partly run:** Charge API (O8); hosted checkout page not run |

## Open technical questions and assumptions

- **Q1.** If refunds couldn't be matched to a transaction by API, R-c's evidence (1) and (2) would fail, and
  every `uncertain` refund would escalate to `refund_stuck`: safe, but more admin work. In test mode the refund
  list and fetch carry `transaction_reference` (O7), so evidence (2) works there. Webhook bodies (evidence 1) and
  live mode are untested, so Q1 stays open.
- **Q2. Decided as design direction (OD1):** a payment that lands after `hold_expires_at` is never applied,
  even before `expire_holds` runs.
- **Q3. Decided as design direction (OD6):** a separate, additive `refund_status` field. The web app will use
  it, so it's listed as a contract change under this ADR (ADR 0009). Whether `refund_due` keeps the wire payment
  status `refunded` is left to the technical plan.
- **Q4 (new, from OD3).** Which Paystack statuses count as an authoritative, unpayable failure. `failed` is
  proposed. It's a documented status (D7), but whether the hosted checkout page lets a customer retry on the
  same reference after a decline is untested (T8, hosted page). OD3 rule 6 keeps the design safe either way.
- **Q5 (sixth revision).** When automatic refund resubmission may be enabled (section D, step 7). It's an owner
  decision after live-mode confirmation; until then, unmatched uncertain refunds go to manual review.
- **Q6 (sixth revision).** The wire value for payment `refund_due`. Now tracked as **contract question X1**
  (states section, "The inconsistency behind X1"). Mapping it to `refunded` would show a refund as completed
  before `processed`; `refund_pending` is recommended. *Implemented as `refund_pending` (`9169985`); awaiting
  the owner's formal ratification (#7e).*
- **Q7 (sixth revision).** `watch_until` per state: one window (OD5) for every inactive attempt, or a shorter
  one for `rejected`. Provisional: the same 7 days.
- **A-assumptions:** U3 (a 4xx means no transaction) is mitigated by A3's same-reference confirmation. U7 (no
  link sent to the customer by Paystack) makes orphaned links unpayable in practice, but the design doesn't rely
  on it: orphaned attempts are watched.
- **Provisional numbers:**
  - `CHECKOUT_STALE_SECONDS` 30;
  - A9's backoff;
  - the watch schedule;
  - R-c's 15-minute double check;
  - R-e's thresholds (24 hours; 5 business days);
  - the new `CHECKOUT_RECONCILE_MAX_ATTEMPTS`, if a cap is kept alongside the window;
  - section G's retry bounds: `40P01` and `40001` retried up to 3 times with a randomised back-off; one retry for
    `23505` and `P0001`;
  - section G's recommended client retry after a temporary 409 (about 2 seconds, once);
  - the attempt cap's value, 3 (OD3 rule 10; an owner decision, #7d).

## Owner decisions: status (2026-10-19; reconciled 2026-10-25)

**Approved as design direction** (OD1–OD9, 2026-10-19; not acceptance; implemented in `9169985`, and on
2026-10-25 the owner authorised retaining that implementation):
- the stale-replay error is `HOLD_EXPIRED` (OD2);
- card-only at launch is the proposed direction, pending confirmation of the Paystack configuration before
  production billing (OD3);
- unknown payments and failed refunds: persistent alerts and a console alert list; refunds done manually in the
  Paystack dashboard; no in-app refund button (OD4);
- the late-payment window is 7 days, **provisional** (OD5);
- no payment after hold expiry (OD1), a separate `refund_status` (OD6), duplicate-reference and duplicate-refund
  reconciliation (OD7, OD8), and the technical safeguards (OD9).

**Still open:**
1. **The remaining Paystack checks:**
   - T2: link lifetime, **not run**;
   - T7: whether Paystack emails the link, **not run**;
   - T6: refund webhook bodies, **not run**; the list and fetch part did run;
   - T8: retry on the hosted checkout page, **not run**; the `/charge` part did run.

   *The recommendation to run T8 on the hosted page before implementing the recovery logic was overtaken:
   the logic was implemented on 2026-10-19 without it. T8 is still worth running. The OD3
   authoritative-failure rule stands whatever the result.* T2, T7 and T6's webhook part must be completed, or
   their risk explicitly accepted by the owner, before production billing.
2. **Live-mode confirmation** of O1, O6 and O7 (verified in live mode, or confirmed by Paystack) before
   production billing (OD7, OD8).
3. **The Paystack configuration for card-only** (OD3), confirmed before production billing. The code supports
   it through `PAYSTACK_FEE_CHANNELS` (unset by default, which allows every channel).
4. **The implementation slot:** *overtaken.* The design was implemented before B7, on 2026-10-19 (`9169985`,
   `a6f1a3a`). On 2026-10-25 the owner authorised retaining it and continuing its review and completion.
5. **Review of the implementation** for the owner's approval. This replaces "the final technical plan", which
   wasn't produced separately before the code was written. The plan as built is in "Implementation status".
6. **Acceptance of ADR 0017** by the owner. Not given; the ADR stays Proposed.
7. **Sixth-revision proposals, awaiting owner confirmation** (`docs/owner-inputs.md` #7d). The code uses
   each proposal's provisional value; none is approved:
   - the settlement-time rule: the database's `clock_timestamp()` at settlement decides, and `paid_at` doesn't
     override it (OD1);
   - at most three attempts per hold (OD3 rule 10);
   - the partial and repeat refund policy (section D);
   - the family-facing wording (section I);
   - the legacy mapping's ambiguous rows (section H);
   - when automatic refund resubmission may be enabled (Q5).
8. **Contract questions** (`docs/owner-inputs.md` #7e). Each is **implemented** as the engineering
   resolution below and is **awaiting the owner's formal ratification**. Each also still needs the ADR 0009
   amendment naming the affected screens and mock handlers, which hasn't been written:
   - **X1:** the wire value for a refund that isn't yet `processed`. *Implemented:* payment status
     `refund_pending`, plus `refund_status` (`none | in_progress | needs_attention | completed`).
   - **X2:** the error for the attempt cap (OD3 rule 10). *Implemented:* `409 CHECKOUT_ATTEMPTS_EXHAUSTED` at
     the provisional cap of 3. The mock handlers don't enforce the cap yet; the error appears there only when
     forced with `?mock_error`.
   - **X3:** the response for an internal checkout-initialisation conflict, which isn't
     `PAYMENT_PROVIDER_ERROR` (OD3 rule 7). *Implemented:* `409 CHECKOUT_IN_PROGRESS`. The concurrency test
     only allows it among the possible results; no test forces it deterministically. Whether it carries
     `details.placement_id`, as proposed, hasn't been checked.

## Readiness summary (sixth revision; reconciled 2026-10-25)

Nothing in this list is complete just because the ADR text was amended. Built and tested locally isn't the
same as approved or verified at Paystack. The three are kept apart below.

1. **Design decisions documented here** (proposed; not accepted; implemented in `9169985`):
   - the attempt states and transitions (AT1–AT19);
   - the refund states and transitions (RT1–RT13) and the recovery algorithm;
   - the invariants I1–I12;
   - the lock order and retry rules (section G);
   - the legacy mapping proposal (section H);
   - entry-point coverage (section E).
2. **Owner decisions awaiting approval:** items 5–8 above (the implementation review, acceptance, the #7d
   proposals, and ratification of X1–X3), plus Q5–Q7. Item 4 is overtaken.
3. **Paystack behaviour needing verification** (unchanged by the implementation; the code is built to stay
   safe if any of these turns out differently, but that is untested in live mode):
   - live-mode duplicate-reference behaviour (O1);
   - live-mode duplicate-refund behaviour (O6);
   - refund-list matching fields, paging and filtering (O7, D13);
   - refund webhook bodies (T6);
   - retry on the hosted checkout page after a decline (T8);
   - hosted link lifetime (T2);
   - whether Paystack emails checkout links (T7);
   - the reliability and timing of `paid_at`;
   - the live-mode refund lifecycle and `reversal-pending`;
   - partial refunds;
   - the card-only configuration (OD3).

   Production billing stays blocked until these are confirmed, or their risk is explicitly accepted by the
   owner (`docs/owner-inputs.md` #13a).
4. **Implementation requirements:** *built in `9169985` and `a6f1a3a` (2026-10-19), local only, not signed
   off:*
   - the new states, `watch_until` and `attempt_no` (migration 0008);
   - I2, I4 (with the cap as a `CHECK`, 1–3), I7, I9, I10 and I11 in the database. I12 is an application
     rule in settlement;
   - I8 as a **counter column** (`payments.refund_committed_kobo`) plus a `CHECK`, not the aggregate trigger
     described in section D (see "Implementation status");
   - `clock_timestamp()` in settlement (`PaymentRepository`) and in the placement transition trigger;
   - the T2 re-check, compare-and-set, and bounded fresh-transaction retries;
   - classification by Paystack `code`, including `transaction_not_found` and `reversal-pending`;
   - no locks across Paystack calls;
   - `reconcile_checkouts`, `watch_checkouts` and the extended `refund_retry` jobs;
   - `refund.*` webhook handling;
   - admin alerts, plus the console alert list at `/admin/alerts`;
   - `refund_status`, and the wire status `refund_pending` (X1);
   - the legacy migration (section H's proposal, with unclear rows raised as `legacy_unresolved` alerts);
   - automatic refund resubmission, built but **off** (`REFUND_AUTO_RESUBMIT=false`) until Q5 and #13a.
5. **Tests:**
   - *Written and run locally on disposable databases (2026-10-19):* API 553 passed, including
     `test_checkout_recovery.py`, `test_refund_lifecycle.py`, `test_admin_alerts.py`,
     `test_migration_0008.py` and `tests/concurrency/test_payment_races.py`. Web Vitest 512 passed.
   - *Not yet done:*
     - Playwright e2e. The last local run (2026-10-20) failed for an environment reason: `.env.local` had
       mocking disabled. No run has passed since `a6f1a3a` or `57a2169`;
     - no re-run of the API suite since the Bun switch (ADR 0018);
     - mock enforcement of the attempt cap;
     - a deterministic `CHECKOUT_IN_PROGRESS` test;
     - web tests for the new error messages;
     - CI on GitHub (the commits aren't pushed);
     - Playwright against the real API (B7).

## Consequences

- **Built behaviour change:** a second accept of the same proposal while it's unpaid returns 201 with the same
  placement (previously 409). `test_accept.py` was updated to match.
- **Gaps in the 2026-10-15 code (`4f1b00b`), addressed by `9169985` and `a6f1a3a` on 2026-10-19:** that code
  held a lock during the Paystack call. It could also:
  - start a trial for a payment that landed after `hold_expires_at`;
  - lose a reference on an ambiguous timeout;
  - re-request a refund after a timeout;
  - treat "refund requested" as refunded;
  - alert only through logs;
  - replay a dead link.

  The fixes are tested locally, not signed off, and not verified in live mode. The web app and MSW were
  updated for `refund_pending`, `refund_status`, `HOLD_EXPIRED` and admin alerts. The MSW handlers don't
  enforce the attempt cap.
- **Built code isn't approved policy.** It uses provisional values the owner hasn't confirmed (#7d):
  - the 3-attempt cap;
  - the `clock_timestamp()` settlement rule;
  - the 7-day watch window;
  - the section I wording, marked `TODO(content)`;
  - the legacy mapping.

  It also uses wire values and error codes the owner hasn't ratified (X1–X3, #7e). The attempt cap is a
  database `CHECK`, so changing it needs a migration.
- **Exactly-once charging is not achievable with Paystack's documented capabilities.** The design guarantees at
  most one applied payment per placement and tracks every other one to a processed refund or an open alert.
- **Migration 0007's downgrade** fails once any proposal has more than one placement. Migration 0008's
  downgrade is guarded: it refuses while `payment_refunds` or `admin_alerts` hold unresolved rows. 0008
  applies section H's forward mapping, which the owner hasn't confirmed (#7d). 0008 hasn't been applied to the
  project databases, only to disposable test databases.
- **Not changed:** a Paystack refusal of the seeded `@demo.hv` emails (owner input #12).

## Implementation status (2026-10-19, reconciled 2026-10-25; local commits on `feature/backend`, not pushed; ADR remains Proposed)

Built in `9169985` (API) and `a6f1a3a` (web, mocks, contracts) on 2026-10-19, with e2e route coverage for
`/admin/alerts` added in `57a2169` (2026-10-22). All are local commits on `feature/backend`, **not pushed**, and
tested on disposable databases only (`hv_adr0017_tests`, `hv_adr0017_scratch`). The project databases weren't
touched and nothing was seeded.

**Authorisation record.** When these commits were made, this ADR's header said the design wasn't authorised
for implementation. The commit message of `9169985` and `docs/CHANGELOG.md` said the owner authorised it on
2026-10-19. That conflict is left as it was recorded. On **2026-10-25** the owner authorised retaining the
implementation and continuing its review and completion, from that date onward. Not reverting the commits
doesn't accept this ADR.

- Migration `0008` (attempt states, `payment_refunds`, `admin_alerts`, counter-based I8 via `payments.refund_committed_kobo` + `CHECK`, placement transition trigger, legacy mapping with `legacy_unresolved` alerts, guarded downgrade).
- Engineering resolutions of the contract questions, **implemented but awaiting the owner's formal ratification (#7e)**: X1 wire status `refund_pending` plus `refund_status`; X2 `CHECKOUT_ATTEMPTS_EXHAUSTED` (409); X3 `CHECKOUT_IN_PROGRESS` (409). `api-contracts.md`, the generated contracts, `error-messages.ts` and the mock error map were updated. The ADR 0009 amendment that the contract freeze requires hasn't been written.
- I8 design changed from a trigger sum to a counter column: on PostgreSQL 16.15, sum-only triggers over-commit under REPEATABLE READ and lock-then-sum deadlocks without an application lock; the counter + `CHECK` was safe under both levels.
- Fix found by the new concurrency tests: `SELECT ... FOR UPDATE` now always refreshes loaded ORM objects (`app/db/session.py`); without it a settlement that waited on a lock decided on stale state.
- Additional test-mode observations: partial refunds can repeat until the total is reached; the refund-list `transaction` filter takes the numeric transaction ID; refunds below ₦50 are refused; `channels: ["card"]` is accepted.
- Tests: API 553 passed / 0 failed / 0 skipped (`test_seed.py` excluded because it seeds with `reset=True`), plus new refund-lifecycle, admin-alert, migration-mapping and race tests; ruff and mypy clean. Contracts regenerated with `pnpm contracts:generate`.

**Implemented, policy still open (owner, #7d):** the settlement-time rule, the attempt cap of 3, the partial and repeat refund policy, the family and admin wording marked `TODO(content)`, the legacy mapping of ambiguous rows, and the resubmission gate (built, off).

**Implemented, contract still unratified (owner, #7e):** X1–X3, above.

**Unverified provider behaviour (#13a):** T2, T6's webhook bodies, T7, T8 on the hosted page, live-mode O1/O6/O7, refund-list paging and filtering, `paid_at` timing, the live refund lifecycle including `reversal-pending`, partial refunds in live mode, and the card-only configuration.

**Engineering gaps (no owner decision needed):**
- the ADR 0009 amendment for X1–X3, once they're ratified;
- MSW enforcement of the attempt cap;
- a deterministic `CHECKOUT_IN_PROGRESS` test, and a check of its `details`;
- web tests for the three new messages;
- a passing Playwright run with mocking forced on;
- an API re-run after ADR 0018;
- CI on GitHub after the owner authorises a push.

**Still required before Accepted:** the owner's review of the implementation, the #7d decisions, ratification of X1–X3 (#7e), and the #13a live-mode verifications (or the owner's explicit acceptance of each risk).
