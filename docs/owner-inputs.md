# What's needed from the owner

Everything the build is waiting on from the owner: accounts, keys, prices and decisions. It's updated at the end of every milestone and reported with the milestone summary. Keys and secrets go into `apps/api/.env` (never into chat or git).

Last updated: 2026-10-30: `feature/backend` pushed to `aa9ae44` (owner's authorisation) and #7 answered: CI is **red** (see #7); the three failures are fixed, committed and pushed on their own (re-run pending). The ADR 0017/0019 work in progress was not committed.

Earlier, 2026-10-25 (documentation reconciliation; no code changed):
- ADR 0017's target design is **implemented** in local commits `9169985` and `a6f1a3a` (2026-10-19), tested
  locally only, and not signed off. On 2026-10-25 the owner authorised **retaining** it and continuing its
  review and completion. The ADR stays **Proposed**.
- X1–X3 (#7e) are **implemented but awaiting the owner's formal ratification**.
- The policy values in the code are provisional until #7d.
- 8 commits on `feature/backend` were local only (`origin` was at `4f1b00b`). Pushed 2026-10-30 (by then 9,
  to `aa9ae44`).

Earlier (2026-10-19):
- Pricing direction recorded in #2 and `docs/pricing.md` (proposed launch pricing; not configured or live).
- ADR 0017 is Proposed, not accepted. Owner decisions OD1–OD9 are recorded in it as design direction (not
  implemented). Its remaining items are #7a, #7d (sixth-revision proposals, awaiting confirmation), #7e
  (contract questions X1–X3, open) and #13a
  (Paystack verification before production billing; it was listed as "#14" on 2026-10-19, which clashed with
  the Phase 1 #14).
- Before B7: #7 (CI, unverified), #7a, #7b (seeded demo emails) and #7c (pending agencies adding workers).
- The Firestore mirror is off (`NOTIFICATIONS_MIRROR=none`).
- #3 and #6b are still to be done in B7. #7 was unverified at the time (answered 2026-10-30: red).

Earlier (2026-10-13): B6 is code complete and committed, pending only #3's end-to-end test (#5 and #8a decided 2026-10-13). Firestore passed (#4 done). Brevo SMTP connectivity passed. The end-to-end email test is deferred to B7 (owner, 2026-10-13), so B6's email criterion stays "partly met" until then. Google sign-in is code complete (ADR 0016), pending #6's live checks.

## Needed now (built without them; they unlock features)

| # | What | Why | How |
| --- | --- | --- | --- |
| 1 | **Paystack monthly plan** → `PAYSTACK_AGENCY_PLAN_CODE`. *Under the 2026-10-19 pricing direction this becomes three monthly plans (Starter, Growth, Professional; `docs/pricing.md` §9 K1). The code supports only one plan code today, so the three plans wait for `docs/pricing.md` §10. A single test-mode plan at the current `AGENCY_SUBSCRIPTION_KOBO` is still enough to test today's subscription flow* | Agency subscriptions can't start without it (placement fees work already) | Paystack dashboard (test mode) → Payments → Plans → create "Agency monthly", interval *monthly*, amount = the subscription price. Copy its code (`PLN_...`) into `apps/api/.env` |
| 2 | **Real prices**: placement fee and monthly subscription, in naira. *Pricing direction approved by the owner 2026-10-19 (`docs/pricing.md` §1): Starter ₦9,900, Growth ₦24,900 and Professional ₦49,900 a month, a ₦15,000 placement fee, Enterprise as future scope, and annual billing deferred. Still **proposed launch pricing**: not configured in Paystack and not live; production billing waits for `docs/pricing.md` §10* | Today the app uses the demo prices (₦20,000 fee, ₦25,000 a month; every location is listed in `docs/pricing.md` §7) | Decide `docs/pricing.md` §9 (VAT, Paystack fees, worker counting, over-limit behaviour, replacement and refund policy, support, Enterprise enquiries, plan descriptions) and the payment-flow questions F1–F8 in §5. Three plans need the code changes in §10 before #1 can be set up for them |

## For B6 (notifications and jobs): built, now only configuration

B6 works without these: emails go to `apps/api/.outbox/`, the feed is served from the database, and retention uses the proposed defaults. Each item below is a `.env` change; no code waits on it.

| # | What | Why | How |
| --- | --- | --- | --- |
| 3 | **Email provider** and its SMTP login. *Brevo is set up and its connectivity check passed on 2026-10-13. Still to do: one real app email end to end (signup, verify and reset through the web app). The owner deferred it to B7 on 2026-10-13; then this row moves to Decided* | Real emails (verify, reset, proposals, trials, approvals) | Choose any provider with SMTP (Resend, Brevo, Postmark, SendGrid). Verify your sending domain there. In `apps/api/.env` set `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USERNAME`, `SMTP_PASSWORD`, and `EMAIL_FROM` on that domain. Then run `uv run python -m scripts.email_live_check you@example.com` |

## Needed before B7 (connecting the web app)

| # | What | Why | How |
| --- | --- | --- | --- |
| 6 | **Google sign-in: the live checks.** *Code complete (ADR 0016). The OAuth client is in `apps/api/.env`. (a) The credentials check passed on 2026-10-13. Still to do: (b) one real sign-in in the browser, which needs the web app connected to the API (B7)* | Confirms the client ID, secret and redirect URI work with Google | (a) `cd apps/api; uv run python -m scripts.google_live_check`, which should print "Client ID and secret: OK". In the console the client's authorised redirect URI must be exactly `http://localhost:8000/api/v1/auth/google/callback`, and your Gmail must be a test user on the consent screen. (b) At B7: sign in with Google with mocks off |
| 7 | **CI result on GitHub** | *Answered 2026-10-30: **red** on `aa9ae44` (run 41072395963; the 13 and 15 Oct runs also failed). The Bun install step works in every job (ADR 0018). Passing: `api`, `contracts`, `a11y-audit` (51 passed). Failing: `web` at lint (unused `eslint-disable` directive, `apps/web/src/app/opengraph-image.tsx:29`; later steps skipped); `lighthouse` at `next build` (`next/font` Google loader `TypeError: Cannot read properties of null (reading '1')` in `src/app/fonts.ts`), so the Phase 1 Lighthouse score is still unproven; `security` at `bun audit --audit-level=high` (10 advisories: 1 critical and 1 high in `next@15.5.27`, plus postcss, undici, vite, zod). All three fixed on 2026-10-30 with the owner's go-ahead, committed and pushed (`docs/CHANGELOG.md`); the re-run's result is pending* | Confirm the re-run is green |
| 7a | **ADR 0017: the remaining decisions.** *Design direction OD1–OD9 approved 2026-10-19. Implemented 2026-10-19 (`9169985`, `a6f1a3a`); owner authorised retaining it on 2026-10-25. The ADR is still Proposed, not accepted, and not signed off* | B7's flows depend on the final checkout, refund and replay semantics | Review the implementation (ADR 0017 "Implementation status"), decide #7d and #7e, then accept the ADR or ask for changes. The implementation slot is overtaken. T8 on the hosted page is still worth running (#13a) |
| 7b | **Seeded demo emails** (see #12) | Paystack refuses `@demo.hv`, so seeded families can't reach checkout in B7's payment flows (`docs/swagger-test-plan.md`, known issue 1) | Decide #12 before B7 |
| 7c | **Pending agencies adding workers** | A pending agency can add workers (`docs/swagger-test-plan.md`, known issue 4, WK7). Listing still needs an approved, subscribed agency, so rule 1 holds | Confirm whether that's intended, so B7's tests expect the right behaviour |
| 7d | **ADR 0017 sixth-revision proposals.** *Proposed, awaiting owner confirmation; none is approved. The code already uses each one's provisional value (cap 3 as a database `CHECK`; `clock_timestamp()` settlement; wording marked `TODO(content)`; section H's legacy mapping; automatic resubmission built but off)* | They settle policy the technical review exposed (findings F2, F7, F13, F17) | Confirm or change each:<br>• **Settlement time:** the database's `clock_timestamp()` at settlement decides whether the hold was valid; browser time, customer claims and Paystack's `paid_at` never override it (ADR 0017 OD1, "Expiry decision point").<br>• **Attempts per hold:** a proposed **fixed** cap of 3, enforced by a database `CHECK` (changing it needs a migration), then a 409 and an admin alert (OD3 rule 10). The error code is #7e X2.<br>• **Partial and repeat refunds:** whether families can get partial or repeat refunds. Late and duplicate payments are refunded in full regardless (ADR section D; `docs/pricing.md` F1).<br>• **Family wording** for uncertain, failed, expired, duplicate and refund states (ADR section I).<br>• **Legacy rows** with ambiguous mappings (ADR section H).<br>• **When automatic refund resubmission may be enabled** (ADR section D step 7, Q5; also needs #13a) |
| 7e | **ADR 0017 contract questions X1–X3.** *Implemented in `9169985` and `a6f1a3a` (2026-10-19) as engineering resolutions; **awaiting the owner's formal ratification**. Updated: the API, `api-contracts.md`, the generated contracts, the web types, labels and messages, and the mock error map. The ADR 0009 amendment hasn't been written* | Each changes what the API returns. A new wire value or error code needs an ADR 0009 amendment naming the affected screens and mock handlers | Ratify or change each (ADR 0017 "Owner decisions: status", item 8):<br>• **X1, refund in progress on the wire.** *Implemented:* payment status `refund_pending` ("Refund in progress"), plus `refund_status` (`none \| in_progress \| needs_attention \| completed`). `refunded` is shown only once Paystack confirms `processed`. Alternative if not ratified: keep `refunded` and make every client read `refund_status`, which means reworking the contract, types, labels and mocks.<br>• **X2, attempt-cap error.** *Implemented:* `409 CHECKOUT_ATTEMPTS_EXHAUSTED` on a fourth attempt (the cap of 3 is itself #7d). Known gap: the mock handlers don't enforce the cap.<br>• **X3, internal checkout conflict.** *Implemented:* `409 CHECKOUT_IN_PROGRESS`, **not** `PAYMENT_PROVIDER_ERROR`. Known gaps: no deterministic test, and `details.placement_id` hasn't been checked |

## Needed for B8 (deploy)

| # | What | Why | How |
| --- | --- | --- | --- |
| 8 | **Render account** (API, PostgreSQL, Redis) and **Vercel account** (web) | Hosting (ADR 0001) | Create both. I'll walk through each setting |
| 8a | **Render Cron Jobs for the scheduled jobs** (decided 2026-10-13) | Set up at deploy: one cron job per job, schedules in ADR 0015 (in UTC), and `JOBS_ENABLED=false` on the API web service | At B8: check Render's current cron pricing and minimum interval (three jobs now run every minute: `expire_holds`, `notification_retry`, `reconcile_checkouts`; ADR 0017) and confirm the cost with me before creating them |
| 9 | **Domain names** | The refresh cookie needs the web app and API on the same site (ADR 0011), for example `helpverified.ng` and `api.helpverified.ng` | Buy or choose a domain; DNS records come at deploy time |
| 9a | **Google sign-in for production** | Google only redirects to registered URIs, and only test users can sign in while the consent screen is in testing | At deploy: add `https://<api-domain>/api/v1/auth/google/callback` to the OAuth client, set the same client's keys in Render, and publish the consent screen (ADR 0016) |
| 10 | **Paystack webhook URL** | Paystack can only call a public address | Once deployed: Paystack dashboard → Settings → API Keys & Webhooks → set `https://<api-domain>/api/v1/webhooks/paystack` |
| 11 | **Paystack test vs live for the demo** | Open decision (CLAUDE.md) | Decide. Live needs a verified Paystack business and live keys set only in production |
| 12 | **Demo accounts' email addresses** | Paystack rejects reserved domains such as `.test`; the demo seed needs addresses it accepts | Decide whether demo accounts use your own domain or ordinary addresses |
| 13 | **Super admin password for the seed** (`SEED_ADMIN_PASSWORD`) | The seed creates the first super admin | Choose one and put it in the deploy environment, never in git |
| 13a | **Paystack verification before production billing** (ADR 0017) | Some of the design rests on test-mode observations or untested behaviour. *The design is now implemented (`9169985`), but none of the items below has been verified in live mode* | Before production billing, either complete each of these or explicitly accept its risk:<br>• T2, link lifetime;<br>• T7, whether Paystack emails the link;<br>• T6, refund webhook bodies;<br>• live-mode confirmation of O1 (duplicate reference), O6 (duplicate refund) and O7 (refund matching), by a test or from Paystack;<br>• refund-list paging, timestamps and filtering, which the design's recovery algorithm depends on;<br>• T8 on the hosted page (retry after a decline);<br>• the reliability and timing of `paid_at`;<br>• the live refund lifecycle, including `reversal-pending`;<br>• partial-refund behaviour;<br>• the card-only configuration (OD3).<br>Automatic refund resubmission stays disabled until O6 and O7 are confirmed in live mode (ADR 0017 section D).<br>The current demo subscription (one plan, ₦25,000) is not the future three-plan system (`docs/pricing.md`) |

## Still open from Phase 1

| # | What | Status |
| --- | --- | --- |
| 14 | Trial length (14 days), replacement window (30 days), free replacements (1) | Defaults in use; confirm or change |
| 15 | Brand fonts (proposed Plus Jakarta Sans + Inter) and a white logo for dark backgrounds | Open |
| 16 | Licences for Photo1–3 | Treated as temporary until confirmed |

## Decided

| What | Decision | When |
| --- | --- | --- |
| When the placement fee is charged | At accept, with the 30-minute hold | 2026-10-07 (ADR 0013) |
| Local Redis | Portable Redis 7.4 build | 2026-10-07 (ADR 0011) |
| Google sign-in | Deferred to its own stage before B7 (2026-10-07, ADR 0011); built on 2026-10-13. Linking a never-verified account removes its password; new Google users choose a role on `/signup/google` | 2026-10-13 (ADR 0016) |
| Evidence of rejected checks | Deleted after 90 days (`RETENTION_REJECTED_EVIDENCE_DAYS=90`) | 2026-10-11 (ADR 0015) |
| Trial reminders | Sent 2 days before a trial ends (`TRIAL_REMINDER_DAYS=2`) | 2026-10-11 (ADR 0015) |
| Firebase (#4) | Project `helpverified`; key kept outside the repo; live check passed | 2026-10-12 |
| Idle-worker evidence (#5) | Deleted after 12 months idle (`RETENTION_IDLE_WORKER_MONTHS=12`); owner left the number to Claude Code. Ended placements kept 6 years (not automated before 2032) | 2026-10-13 (ADR 0015) |
| Where scheduled jobs run in production (#8a) | Render Cron Jobs; the API web service runs with `JOBS_ENABLED=false` | 2026-10-13 (ADR 0015) |
| JavaScript package manager | Bun 1.4 replaces pnpm (lockfile migrated, versions unchanged) | 2026-10-22 (ADR 0018) |
