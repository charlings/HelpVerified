# Launch pricing — version 1

- **Version:** 1, revision 2
- **Date:** 2026-10-19
- **Status:** **Proposed launch pricing.** The owner approved the pricing direction on 2026-10-19 (§1). It is
  still **pending the production-readiness decisions and work** in §9 and §10:
  - not approved for production billing;
  - **not configured in Paystack**: no plans exist for these prices, and no plan codes are recorded;
  - **not live in the app**: the app still uses the demo amounts listed in §7.
- **Owner input:** answers `docs/owner-inputs.md` #2 as a proposal. #2 stays open until production billing is
  approved.
- **Scope:** documentation only. It changes no code, copy, configuration, contract or Paystack setting.

## 1. Owner direction (2026-10-19)

Approved as the **direction for proposed launch pricing**. This is not permission to configure production
billing.

1. Starter: ₦9,900 a month; proposed limits of 10 approved worker profiles and 3 active placements.
2. Growth: ₦24,900 a month; proposed limits of 40 approved worker profiles and 10 active placements.
3. Professional: ₦49,900 a month; proposed limits of 100 approved worker profiles and 30 active placements.
4. Family placement fee: ₦15,000 per placement.
5. Enterprise: custom pricing, future scope.
6. Agency subscriptions and family placement fees are **separate revenue streams**.
7. The family placement fee is **separate from agency recruitment fees and worker salaries**.
8. **Do not advertise functionality that isn't implemented.**
9. **Annual billing is deferred** until monthly subscriptions are correctly implemented and tested.
10. All three plans may be **prepared** for launch. **Production billing waits** until the subscription logic,
    backend limits, pricing configuration and payment tests are complete (§10).

## 2. Launch prices (proposed)

All amounts are in Nigerian naira (NGN). The system stores money as integer kobo (₦1 = 100 kobo).

| Plan | Audience | Price | Kobo | Billing |
| --- | --- | --- | --- | --- |
| Starter | Agencies | ₦9,900 a month | 990,000 | Monthly |
| Growth | Agencies | ₦24,900 a month | 2,490,000 | Monthly |
| Professional | Agencies | ₦49,900 a month | 4,990,000 | Monthly |
| Enterprise | Agencies | Custom, no public price | — | Future scope; no checkout |
| Placement fee | Families | ₦15,000 per placement | 1,500,000 | Once, at accept |

Families pay no subscription; posting requests and reviewing proposals is free. VAT and Paystack fees are open
(§9).

## 3. Deferred: annual billing

Not part of launch pricing (owner direction 9). Revision 1 proposed annual prices of ₦99,000, ₦249,000 and
₦499,000: ten times the monthly price, so two months free (16.7%). They're kept here **for reference only,
not approved**.

They need a fresh decision once monthly billing is implemented and tested. Annual billing also needs code
changes (§6: activation currently assumes one month) and Paystack plans with the `annually` interval. That
interval is documented in Paystack's API specification but hasn't been tested.

## 4. Agency plans

| Plan | Target customer | Approved worker profiles | Active placements |
| --- | --- | --- | --- |
| Starter | Small agencies getting started with digital worker records and placements | Up to 10 (**not enforced yet**) | Up to 3 (**not enforced yet**) |
| Growth | Established agencies managing more workers and placements | Up to 40 (**not enforced yet**) | Up to 10 (**not enforced yet**) |
| Professional | Higher-volume agencies with more extensive operations | Up to 100 (**not enforced yet**) | Up to 30 (**not enforced yet**) |
| Enterprise | Agencies beyond Professional's limits or needing extra capabilities | Custom | Custom |

**Benefits that exist today and may be advertised** (to every approved, subscribed agency; nothing is gated by
plan yet):
- the worker verification checklist and document tracking;
- family requests and placement proposals;
- the basic agency dashboard;
- email notifications. This one needs the end-to-end email check (owner input #3) before it's advertised as
  working;
- replacement requests;
- placement history.

**Proposed benefits that aren't built, and must not be advertised** (owner direction 8):
- the plan limits;
- operational reports;
- advanced placement and replacement reports;
- staff activity and operational oversight;
- priority email support and priority support;
- annual billing.

Because the existing benefits aren't plan-specific, Growth and Professional currently have **no
distinguishing benefit except their higher limits**, and those limits aren't enforced yet. Their published
descriptions need a decision (§9, D7).

## 5. Family placement fee

- **₦15,000 per placement**, charged once at the existing payment step. That step is accept: accepting creates
  a 30-minute `pending_payment` hold, and payment starts the trial (ADR 0013, owner decision 2026-10-07).
- **A separate revenue stream** from agency subscriptions.
- **Separate from agency recruitment fees and worker salaries.** HelpVerified doesn't collect, set or process
  either.
- **One charge per placement entitlement:**
  - **Built:** `/pay` resumes the same checkout (ADR 0014 §4), and a payment after the hold has ended is
    refunded (ADR 0014 §3).
  - **Proposed in ADR 0017, not implemented:** at most one applied payment per placement, enforced by the
    database, and every other real payment tracked to a completed refund.
  - **Exactly-once charging can't be guaranteed** with Paystack's documented capabilities (ADR 0017). The
    commitment is that a second charge is refunded.

**Questions before production billing** (no policy is assumed):

| # | Question | What exists today |
| --- | --- | --- |
| F1 | **Refund policy:** agency withdraws, worker doesn't start, family ends during trial, duplicate charge | Only late payments after a hold has ended are refunded automatically (ADR 0014 §3). No family-initiated refunds |
| F2 | **Failed payments:** how long the family can retry, and what it sees | The hold lasts `PAYMENT_HOLD_MINUTES` (30); retry behaviour is in ADR 0017 (Proposed) |
| F3 | **Expired holds:** confirm that nothing is charged, and that a new hold may be created | Built: the hold is cancelled, the request reopens, and accepting again creates a new hold |
| F4 | **Late payments:** the family-facing wording | Refunded automatically; the lifecycle is redesigned in ADR 0017 (Proposed) |
| F5 | **Replacement policy:** free or not, how many, and the window | The code waives the fee for `FREE_REPLACEMENTS` (default 1) within `REPLACEMENT_WINDOW_DAYS` (default 30). Both are an **open decision** (CLAUDE.md). Existing copy already promises it (§8) |
| F6 | **VAT** treatment | Not modelled |
| F7 | **Paystack fees:** absorbed or passed on | Not modelled; the family pays exactly the fee |
| F8 | **Receipts** | Paystack's receipt only; `GET /payments` lists payments |

## 6. Implementation status (checked 2026-10-19)

| Item | Status | Evidence or gap |
| --- | --- | --- |
| Verification checklist and document tracking | **Built** | Four checks, evidence documents, expiry and delisting (B3, ADR 0012) |
| Family requests and proposals | **Built** | B4, ADR 0013 |
| Basic agency dashboard | **Built** | `GET /agencies/me/dashboard`: subscription, worker counts, checks needing attention (submitted, rejected or expired), open requests, trials ending |
| Email notifications | **Built; real delivery not verified** | B6, ADR 0015; owner input #3 |
| Replacement requests | **Built (not gated)** | `POST /placements/{id}/replacement` creates a linked request; the free-replacement waiver depends on F5 |
| Placement history | **Built (not gated)** | `GET /placements` with each placement's events |
| Operational reports; advanced reports | **Not built** | No reports or exports |
| Staff activity and oversight | **Not built** | One `agency_admin` user per agency (`agency_members`); no staff accounts or invitations; the audit log is super-admin only |
| Priority support | **Not built** | An operational commitment; no process or tooling |
| Worker limits (10 / 40 / 100) | **Not built** | No per-agency worker limit; the counting rule is open (D3) |
| Active-placement limits (3 / 10 / 30) | **Not built** | Only rule 2 (one active placement per worker) |
| Several plans; choosing a plan | **Not built** | One `PAYSTACK_AGENCY_PLAN_CODE` and one `AGENCY_SUBSCRIPTION_KOBO`; `POST /billing/subscription` takes no plan |
| Plan stored per agency | **Partly built** | `subscriptions.plan_code` is stored but not mapped to limits or benefits |
| Monthly billing correctness | **Built, untested end to end** | Activation sets `current_period_end` one month after payment (`PaymentService._activate`). The subscription flow can't run without a Paystack plan code (owner input #1) |
| Annual billing | **Not built (deferred)** | Activation always adds one month |
| Enterprise | **Not built (future scope)** | — |

## 7. Where the demo prices are used today (not changed)

The demo placement fee is ₦20,000 (2,000,000 kobo); the demo subscription is ₦25,000 a month (2,500,000 kobo).

**API: the source of the amounts actually charged:**

| Location | What |
| --- | --- |
| `apps/api/app/core/config.py:76` | `PLACEMENT_FEE_KOBO` default `2_000_000` |
| `apps/api/app/core/config.py:77` | `AGENCY_SUBSCRIPTION_KOBO` default `2_500_000` ("must match the plan") |
| `.env.example:51–52` | `PLACEMENT_FEE_KOBO=2000000`, `AGENCY_SUBSCRIPTION_KOBO=2500000` |
| `apps/api/.env` (local, untracked) | Neither key is set, so the defaults above apply (only these two keys were checked) |
| `apps/api/app/modules/payments/service.py:131` | The placement-fee checkout amount (`PLACEMENT_FEE_KOBO`) |
| `apps/api/app/modules/payments/service.py:172` | The subscription checkout amount (`AGENCY_SUBSCRIPTION_KOBO`) |
| `apps/api/app/scripts/seed.py:472, 499` | Seeded payments use both settings |
| `apps/api/scripts/paystack_live_check.py:31, 54` | The live-check script charges and verifies `PLACEMENT_FEE_KOBO` |
| `docs/decisions/0014-b5-payments.md` §6 | Records both demo settings |

**API tests with the literal demo amounts** (they need updating when the prices change):
- `tests/integration/test_accept.py:36, 41`;
- `tests/integration/test_payments_billing.py:33, 58, 101, 127, 135, 137`;
- `tests/integration/test_paystack_webhook.py:38, 129`;
- `tests/integration/test_placements.py:258`;
- `tests/unit/test_paystack.py:58`.

`tests/unit/test_b6_units.py:56` only tests how ₦20,000 is formatted, not the price.

**Web app (mock API and display):**

| Location | What |
| --- | --- |
| `apps/web/src/mocks/seed.ts:25` | `DEMO_PLACEMENT_FEE_KOBO = 20_000 * 100` |
| `apps/web/src/mocks/seed.ts:27` | `DEMO_SUBSCRIPTION_KOBO = 25_000 * 100` |
| `apps/web/src/mocks/seed.ts:480, 492` | Seeded mock payments |
| `apps/web/src/mocks/db.ts:5, 8` | Re-exports `DEMO_PLACEMENT_FEE_KOBO` |
| `apps/web/src/mocks/handlers/family-requests.ts:212` | Mock accept: the payment amount |
| `apps/web/src/mocks/handlers/billing.ts:54` | Mock subscription: the payment amount |
| `apps/web/src/features/billing/screens/AgencyBillingScreen.tsx:87` | The "Demo amounts" notice |
| `apps/web/src/features/billing/screens/FamilyPaymentsScreen.tsx:17` | The "Demo amounts" notice |
| `apps/web/src/features/payments/screens/DemoCheckoutScreen.tsx:78, 97` | Shows the amount and "Pay … (demo)" |
| `apps/web/src/features/requests/screens/family-screens.test.tsx:170` | Test expects "Pay ₦20,000 (demo)" |
| `apps/web/src/content/pages.ts:95, 110` | The pricing page: `amountKobo: null`, shown as "Price to be confirmed" |
| `docs/placeholders.md:24, 26` | The placeholder register |

The screens display amounts from API or mock data; no screen hardcodes ₦20,000 or ₦25,000. The generated
contracts (`packages/contracts`) contain neither value.

## 8. Existing copy that needs a later decision (not changed)

All of this text is user-facing in the web app. It's marked as draft (`TODO(content)`) in the source, but it
would be published as written.

**Promises a free replacement, which is an unapproved policy (F5):**

| File and line | Wording |
| --- | --- |
| `apps/web/src/content/pages.ts:102` (pricing page, family plan) | "A free replacement if it doesn't work out" |
| `apps/web/src/content/pages.ts:129–130` (pricing FAQ) | "Is a replacement charged again?" — "No. Your placement fee covers a replacement if the first placement doesn't work out." |
| `apps/web/src/content/pages.ts:8` (how it works) | "Placements start with a trial, and replacements are part of the deal." |
| `apps/web/src/content/trial.ts:3–4, 16–17` (trial promise block) | "Replacement if it doesn't work out" — "Ask for a replacement during the trial or within {30} days of confirming. Your placement fee covers {one free replacement}." (from `config/business.ts`; defaults awaiting owner confirmation) |
| `apps/web/src/features/requests/components/AcceptDialog.tsx:46` (in-app toast) | "Accepted. No fee is due: your replacement is covered. The trial has started." |
| `apps/web/src/features/requests/components/AcceptDialog.tsx:76` (in-app dialog) | "This is a replacement. If it's covered by your free replacement, there's no fee and the {n}-day trial starts straight away." |
| `apps/web/src/features/requests/screens/FamilyRequestDetailScreen.tsx:82` (in-app notice) | "Agencies can propose a new worker. Your free replacement covers the fee." |
| `apps/web/src/features/placements/screens/PlacementDetailScreen.tsx:173` (in-app detail) | "Replacements used: {n} of {1} free" |
| `apps/web/src/features/placements/screens/PlacementDetailScreen.tsx:228` (in-app replacement dialog) | "This placement ends and a new request opens with the same details, so agencies can propose someone else. Your placement fee covers {one replacement}." |

The in-app strings (`AcceptDialog.tsx`, `FamilyRequestDetailScreen.tsx`, `PlacementDetailScreen.tsx`)
describe the built fee waiver accurately. They still depend on F5 being approved. The `{…}` values come from
`apps/web/src/config/business.ts` (`freeReplacements: 1`, `replacementWindowDays`), which are defaults awaiting
the owner.

**Overstates a benefit:**

| File and line | Wording | Gap |
| --- | --- | --- |
| `apps/web/src/content/pages.ts:117` (pricing page, agency plan) | "Alerts when a check needs renewing" | No advance alert exists. The agency is notified once a check has **expired** (`checks_expired`), and the dashboard counts submitted, rejected or expired checks |
| `apps/web/src/content/pages.ts:59` (for-agencies page, "Checks in one place") | "Record evidence for each check once. We tell you when a check needs renewing." | Same gap: the notice comes only after expiry |

**Describes a single plan, which needs updating for three plans:**
- `apps/web/src/content/pages.ts:35`: "One placement fee for families. One monthly subscription for agencies."
- `apps/web/src/content/pages.ts:88`: "Agencies pay a monthly subscription to list workers and receive requests."
- `apps/web/src/content/pages.ts:109–112`: a single "Agency subscription" plan, "Billed monthly".
- `apps/web/src/content/metadata.ts:65`: "…One monthly subscription for agencies. See what each includes."

**Placeholders for policy that doesn't exist yet:**
- `apps/web/src/content/legal.ts:66`: "Payments and refunds" — "How fees are charged and when refunds apply." This
  needs F1.

**Checked and consistent with the direction** (no decision needed):
- `apps/web/src/content/home.ts:31`: "Post a request for free. You only pay when you accept a worker."
- `apps/web/src/content/pages.ts:99–101, 114–116`: free requests, agency proposals, the trial, listing checked
  workers, matching requests, placement tracking. All built.
- `apps/web/src/content/pages.ts:152` ("…four checks, recorded with evidence, renewed on schedule…"): describes
  the standard. Expiry and automatic delisting are built.
- `apps/web/src/features/billing/screens/AgencyBillingScreen.tsx:156` ("It renews monthly."): matches the one
  monthly plan that's built.

## 9. Open decisions (kept open)

- **D1. VAT treatment:** are prices VAT-inclusive (F6)?
- **D2. Paystack fees:** absorbed or passed on (F7)?
- **D3. Counting approved workers:** what counts toward a plan's worker limit (listed workers only, or every
  worker that isn't a draft)?
- **D4. Over-limit behaviour** after a downgrade or a lapsed subscription. For example: block new listings and
  proposals but keep existing ones listed. What happens to active placements above the limit?
- **D5. Replacement and refund policy** (F1, F5). This governs the copy in §8.
- **D6. Support commitments:** priority support's channel and response targets, or no support claims at
  launch.
- **D7. Plan descriptions** for Growth and Professional while their extra benefits don't exist (direction 8).
  *Recommendation: publish limits and built benefits only.*
- **D8. Enterprise enquiries:** the route (for example the contact form, topic "agency") and who handles them.
- **K1. Paystack plans:** three monthly plans, created first in test mode, then live (owner inputs #1 and
  #11). None exist.
- **K2. Test or live mode for the demo** (owner input #11).
- **F2–F4, F8:** the payment-flow wording and receipts (§5).

## 10. Launch readiness

**May be prepared now** (subject to approval of each piece of work):
- all three plans' definitions in one pricing catalogue;
- Paystack test-mode plans;
- draft pricing-page copy that advertises only built benefits.

**Blockers before production billing:**
1. **Pricing configuration:** one catalogue in the API (three plans, the placement fee) replacing
   `AGENCY_SUBSCRIPTION_KOBO` and the web demo constants, served to the web app. This is a contract addition
   under ADR 0009.
2. **Subscription logic:**
   - choosing a plan at `POST /billing/subscription`;
   - storing the plan on the subscription;
   - one Paystack plan code per plan, from the environment, with a start-up check that each plan's amount
     matches the catalogue;
   - a monthly renewal and lapse tested end to end.
3. **Backend limits:** the worker limit (after D3) and the active-placement limit, enforced in services under a
   lock, alongside rule 2 without weakening it; the over-limit behaviour (D4); new error codes in the contract.
4. **Payment tests:**
   - the end-to-end Paystack test-mode flows for the placement fee and each plan;
   - ADR 0017 accepted and implemented (checkout recovery, late payments, refunds);
   - the existing tests' demo amounts updated (§7).
5. **Policy and copy:** D1–D8 and F1–F8 decided; the copy in §8 rewritten to match; the terms' payments and
   refunds section written.
6. **Operations:** Paystack plans created (K1); test or live mode decided (K2); real email verified (#3); CI
   green (#7).

**Smallest next step** (when approved): the pricing catalogue, the plan on the subscription, and checkout that
takes a plan, all monthly only. Limits, reports, staff features and annual billing are later work.

None of this is started. It's separate from ADR 0017 (Proposed) and from B7 (not started).

## 11. Illustrative subscription revenue (an example, not a forecast)

| Plan | Agencies | Monthly price | Monthly revenue |
| --- | --- | --- | --- |
| Starter | 20 | ₦9,900 | ₦198,000 |
| Growth | 10 | ₦24,900 | ₦249,000 |
| Professional | 3 | ₦49,900 | ₦149,700 |
| **Total** | 33 | | **₦596,700 a month** |

This is before Paystack fees, taxes, operating costs, discounts and churn, and it excludes placement-fee revenue
(a separate stream). The agency counts are illustrative, not market research. No competitor prices are cited.
