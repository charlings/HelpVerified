# What's needed from the owner

Everything the build is waiting on from the owner: accounts, keys, prices and decisions. It's updated at the end of every milestone and reported with the milestone summary. Keys and secrets go into `apps/api/.env` (never into chat or git).

Last updated: B5 sign-off, 2026-10-07.

## Needed now (B5 is done without them, but they unlock features)

| # | What | Why | How |
| --- | --- | --- | --- |
| 1 | **Paystack monthly plan** → `PAYSTACK_AGENCY_PLAN_CODE` | Agency subscriptions can't start without it (placement fees work already) | Paystack dashboard (test mode) → Payments → Plans → create "Agency monthly", interval *monthly*, amount = the subscription price. Copy its code (`PLN_...`) into `apps/api/.env` |
| 2 | **Real prices**: placement fee and monthly subscription, in naira | Today they're the demo prices (₦20,000 fee, ₦25,000 a month) | Tell me the amounts. The plan's amount in Paystack must equal the subscription price |

## Needed for B6 (notifications and jobs)

| # | What | Why | How |
| --- | --- | --- | --- |
| 3 | **Email provider** choice and its API key | Verify-email, reset-password and placement emails are only written to a local folder today | Choose one (for example Resend, Postmark, Brevo or SendGrid). Create an account, verify the sending domain, then add the key to `.env` |
| 4 | **Firebase project** and a service-account key (JSON) | The in-app notification feed is mirrored to Firestore | Firebase console → new project → Firestore (production mode) → Project settings → Service accounts → generate key. Keep the file outside the repo; I'll say where to point `.env` |
| 5 | **Document retention periods** | NDPA storage limitation; a cleanup job deletes old evidence | Confirm the proposed defaults: documents of workers with no placement for 24 months, rejected evidence after 90 days, ended placements kept 6 years |

## Needed before B7 (connecting the web app)

| # | What | Why | How |
| --- | --- | --- | --- |
| 6 | **Google OAuth client** (if you want Google sign-in) | Deferred from B2 (ADR 0011) | Google Cloud console → APIs & Services → Credentials → OAuth client ID (web). I'll give the redirect URL. Or decide to drop Google for v1 |
| 7 | **CI result on GitHub** | CI has never been confirmed green; the Lighthouse score from Phase 1 is still unproven | GitHub → Actions → the latest `feature/backend` run: is it green? If not, paste the failing step |

## Needed for B8 (deploy)

| # | What | Why | How |
| --- | --- | --- | --- |
| 8 | **Render account** (API, PostgreSQL, Redis) and **Vercel account** (web) | Hosting (ADR 0001) | Create both. I'll walk through each setting |
| 9 | **Domain names** | The refresh cookie needs the web app and API on the same site (ADR 0011), for example `helpverified.ng` and `api.helpverified.ng` | Buy or choose a domain; DNS records come at deploy time |
| 10 | **Paystack webhook URL** | Paystack can only call a public address | Once deployed: Paystack dashboard → Settings → API Keys & Webhooks → set `https://<api-domain>/api/v1/webhooks/paystack` |
| 11 | **Paystack test vs live for the demo** | Open decision (CLAUDE.md) | Decide. Live needs a verified Paystack business and live keys set only in production |
| 12 | **Demo accounts' email addresses** | Paystack rejects reserved domains such as `.test`; the demo seed needs addresses it accepts | Decide whether demo accounts use your own domain or ordinary addresses |
| 13 | **Super admin password for the seed** (`SEED_ADMIN_PASSWORD`) | The seed creates the first super admin | Choose one and put it in the deploy environment, never in git |

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
| Google sign-in | Deferred to its own stage before B7 | 2026-10-07 (ADR 0011) |
