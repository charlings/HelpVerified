# Plan: M6 — Family workspace

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 8, 15, 18–20, 22–23; milestone M6)
**Status:** Approved 2026-10-05 · Built 2026-10-05 (Stages A and B) · Signed off 2026-10-05

## Objective

A family can do everything on their side against the mock API: post a request, review proposals and each worker's verified checks, accept one, pay the placement fee through a demo checkout, follow the trial, confirm or end the placement, and ask for a replacement. The one-active-placement rule holds when two families try to accept the same worker.

Out of scope: real Paystack (B5), notifications and emails (B6), admin tools (M7).

## Delivery in two stages

- **Stage A — Requests, proposals, accept and pay:** new request (multi-step), requests list, request detail with proposals, worker public profile, decline, cancel request, accept, demo checkout, payment callback.
- **Stage B — Placements and the rest:** placement actions (confirm, end, cancel an unpaid hold, request a replacement), family dashboard, payments history, settings, and the full cross-role journey test.

## Decisions needing approval

1. **Payments mirror Paystack's real redirect flow, with only the checkout page faked.** Accepting returns `{placement, payment: {authorization_url, reference}}` as the contract says. In demo mode `authorization_url` points to an in-app **Demo checkout** page (`/demo/checkout`, 404 when mocking is off) clearly marked "No money moves". "Pay" there simulates Paystack's `charge.success` webhook (the mock moves the placement `pending_payment → trial`), then sends the family to the **real** callback page (`/family/payments/callback?reference=…`), which calls `GET /payments/{reference}/verify` exactly as it will in production. "Cancel" returns to the callback with the payment still pending. When Paystack is connected (B5), only the URL changes.
2. **Placement fee amount is a demo value** (labelled "Demo amount" wherever shown), because the real price is still an open decision. The fee is charged at accept (`FEE_CHARGED_AT=accept`, the current default) with the 30-minute hold.
3. **A replacement covered by the free allowance skips payment:** accepting a proposal on a replacement request, while `replacements_used ≤ FREE_REPLACEMENTS`, creates the placement straight in `trial` and says "No fee — covered by your replacement".
4. **Posting a request needs a verified email** (`EMAIL_NOT_VERIFIED`, per the auth rules). The family's area is taken from their first request; there's no separate profile form.
5. **The worker profile a family sees is deliberately limited** (`WorkerPublicOut`): first name, role, experience, languages, agency name, and the four checks with the date each was verified. No surname, NIN digits, address, phone or documents. Only families who received a proposal for that worker can open it; anyone else gets 404.
6. **Concurrent accept:** the mock locks the decision the way the database does (the second accept for a worker with an active placement gets `409 WORKER_UNAVAILABLE`). The UI shows "This worker has just been placed with another family", refreshes the proposals and keeps the others available. In the browser it's demonstrated with a scoped forced error (same reason as M5: each tab has its own mock database); the rule itself is unit-tested.
7. **New routes:** `routes.family.paymentCallback` (`/family/payments/callback`) and `routes.demoCheckout` (`/demo/checkout`, noindex, outside the workspaces). Recorded in the route map.
8. **Ending and cancelling need a reason** (shown to both parties), as in M5. A replacement request asks for a reason too, so the agency knows what to look for.

## Screens

| Route | Content | Key states |
| --- | --- | --- |
| `/family` | Active placements (status, trial countdown), open requests with proposal counts, quick action "Post a request", payment due banner for unpaid holds | Skeleton · empty (no requests yet) · error |
| `/family/requests` | Table → cards: title, role, area, start date, status, proposals | Skeleton · empty · error |
| `/family/requests/new` | Stepper: role and schedule → area, start date, budget, trial length (7–30, default 14) → description → review | Field and step errors · `EMAIL_NOT_VERIFIED` · prefilled role from `?role=` (from the service pages) |
| `/family/requests/[id]` | Request details; proposals as cards (worker first name, experience, agency, check badges, note) with View profile / Accept / Decline; Cancel request | No proposals yet · `WORKER_UNAVAILABLE` · `REQUEST_NOT_OPEN` · cancelled/matched states |
| `/family/workers/[id]` | Public profile and verified-check dates | Not found (no proposal) |
| `/demo/checkout` | Demo payment page: amount, reference, Pay / Cancel | Unknown reference |
| `/family/payments/callback` | Verifying → paid (go to placement) / not paid yet (try again) / failed | Each outcome |
| `/family/placements`, `/family/placements/[id]` | M5 screens with `viewer="family"`: Pay (resumes checkout), Cancel hold, Confirm, Request a replacement, End | `ILLEGAL_TRANSITION` · `REPLACEMENT_WINDOW_CLOSED` |
| `/family/payments` | Payment history | Skeleton · empty · error |
| `/family/settings` | Account and family area (read-only) | Skeleton · error |

## Steps

### Stage A
1. **Mock domain:** family request handlers (`POST/GET /requests` for families, `GET /requests/{id}`, `POST /requests/{id}/cancel`, `GET /requests/{id}/proposals` with worker summaries), `POST /proposals/{id}/decline`, `POST /proposals/{id}/accept` (lock order and checks from `database.md` §7: proposal pending and owned, request open, worker listed and available, then create the hold, supersede other proposals, mark the request matched, create the pending payment), `GET /workers/{id}/public`, `GET /payments/{reference}/verify`, and the demo-only `POST /__mock/paystack/charge` (simulated webhook: idempotent by reference, re-checks the amount, moves the placement to trial with trial dates; if the hold already expired and the worker was taken, marks the payment for refund and creates no placement).
2. **Features:** extend `features/requests` (family types, API, schemas, status), `features/workers` (public profile), `features/payments` (accept → checkout → verify).
3. **Screens:** new request, requests list, request detail with proposals, worker public profile, demo checkout, payment callback.
4. **Tests:** mock rules (accept checks, supersede, hold, idempotent charge, refund-on-race, public profile visibility, `EMAIL_NOT_VERIFIED`); screens for every state above; e2e for accept → pay → trial and the concurrent-accept message.
5. **Commit Stage A.**

### Stage B
6. **Mock domain:** family placement actions (`confirm`, `cancel` an unpaid hold, `end`, `replacement` per `database.md` §6 including the window, the linked new request and the free allowance), family dashboard, family payments, `GET /me` family area.
7. **Screens:** family actions wired into `PlacementDetailScreen`, family dashboard, payments, settings.
8. **Tests:** replacement rules (inside and outside the window, free allowance, fee waived on the next accept); the **full journey e2e**: sign up → verify → post request → (agency) propose → (family) accept → demo pay → trial → confirm; the **replacement e2e**; axe on every screen and state at 375 and 1280 px.
9. **Docs and report:** route map, architecture (payment flow), API contract (accept response, verify, public worker, replacement), placeholders, CHANGELOG M6, CLAUDE.md. **Commit Stage B.**

## M6 acceptance criteria (from the testing reference)

- [x] Dashboard, new request (multi-step), requests list, request detail with proposals, worker public profile, accept + mocked payment, placement detail with timeline and actions, payments, settings
- [x] Playwright: signup → request → agency proposes → accept → pay (mock) → trial → confirm
- [x] Replacement flow
- [x] Concurrent-accept error message
- [x] lint, typecheck, unit tests, build, Chromium e2e + axe all pass (see `docs/CHANGELOG.md` M6 §5)

## Risks

- **Cross-role journey in one tab:** the mock database lives per tab, so the journey test signs out and in as each role in the same tab (the session storage persists). That's realistic for demo review but not for real concurrency; B4 covers that.
- **Test time:** about 35 more e2e tests. If the full suite passes ~12 minutes locally, I'll split it into two CI jobs rather than drop coverage.
