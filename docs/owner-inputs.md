# What's needed from the owner

Everything the build is waiting on from the owner: accounts, keys, prices and decisions. It's updated at the end of every milestone and reported with the milestone summary. Keys and secrets go into `apps/api/.env` (never into chat or git).

Last updated: 2026-10-13. B6 is code complete and committed, pending only #3's end-to-end test (#5 and #8a decided 2026-10-13). Firestore passed (#4 done). Brevo SMTP connectivity passed. The end-to-end email test is deferred to B7 (owner, 2026-10-13), so B6's email criterion stays "partly met" until then.

## Needed now (built without them; they unlock features)

| # | What | Why | How |
| --- | --- | --- | --- |
| 1 | **Paystack monthly plan** → `PAYSTACK_AGENCY_PLAN_CODE` | Agency subscriptions can't start without it (placement fees work already) | Paystack dashboard (test mode) → Payments → Plans → create "Agency monthly", interval *monthly*, amount = the subscription price. Copy its code (`PLN_...`) into `apps/api/.env` |
| 2 | **Real prices**: placement fee and monthly subscription, in naira | Today they're the demo prices (₦20,000 fee, ₦25,000 a month) | Tell me the amounts. The plan's amount in Paystack must equal the subscription price |

## For B6 (notifications and jobs): built, now only configuration

B6 works without these: emails go to `apps/api/.outbox/`, the feed is served from the database, and retention uses the proposed defaults. Each item below is a `.env` change; no code waits on it.

| # | What | Why | How |
| --- | --- | --- | --- |
| 3 | **Email provider** and its SMTP login. *Brevo is set up and its connectivity check passed on 2026-10-13. Still to do: one real app email end to end (signup, verify and reset through the web app). The owner deferred it to B7 on 2026-10-13; then this row moves to Decided* | Real emails (verify, reset, proposals, trials, approvals) | Choose any provider with SMTP (Resend, Brevo, Postmark, SendGrid). Verify your sending domain there. In `apps/api/.env` set `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USERNAME`, `SMTP_PASSWORD`, and `EMAIL_FROM` on that domain. Then run `uv run python -m scripts.email_live_check you@example.com` |

## Needed before B7 (connecting the web app)

| # | What | Why | How |
| --- | --- | --- | --- |
| 6 | **Google OAuth client** (if you want Google sign-in) | Deferred from B2 (ADR 0011) | Google Cloud console → APIs & Services → Credentials → OAuth client ID (web). I'll give the redirect URL. Or decide to drop Google for v1 |
| 7 | **CI result on GitHub** | CI has never been confirmed green; the Lighthouse score from Phase 1 is still unproven | GitHub → Actions → the latest `feature/backend` run: is it green? If not, paste the failing step |

## Needed for B8 (deploy)

| # | What | Why | How |
| --- | --- | --- | --- |
| 8 | **Render account** (API, PostgreSQL, Redis) and **Vercel account** (web) | Hosting (ADR 0001) | Create both. I'll walk through each setting |
| 8a | **Render Cron Jobs for the scheduled jobs** (decided 2026-10-13) | Set up at deploy: one cron job per job, schedules in ADR 0015 (in UTC), and `JOBS_ENABLED=false` on the API web service | At B8: check Render's current cron pricing and minimum interval (two jobs run every minute) and confirm the cost with me before creating them |
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
| Evidence of rejected checks | Deleted after 90 days (`RETENTION_REJECTED_EVIDENCE_DAYS=90`) | 2026-10-11 (ADR 0015) |
| Trial reminders | Sent 2 days before a trial ends (`TRIAL_REMINDER_DAYS=2`) | 2026-10-11 (ADR 0015) |
| Firebase (#4) | Project `helpverified`; key kept outside the repo; live check passed | 2026-10-12 |
| Idle-worker evidence (#5) | Deleted after 12 months idle (`RETENTION_IDLE_WORKER_MONTHS=12`); owner left the number to Claude Code. Ended placements kept 6 years (not automated before 2032) | 2026-10-13 (ADR 0015) |
| Where scheduled jobs run in production (#8a) | Render Cron Jobs; the API web service runs with `JOBS_ENABLED=false` | 2026-10-13 (ADR 0015) |
