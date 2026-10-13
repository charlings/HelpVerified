# 0015 — B6: notifications, email and scheduled jobs

- **Status:** Accepted
- **Date:** 2026-10-08 (B6)
- **Decided by:** Claude Code during B6, within backend.md §7–§9 and security-and-compliance.md §1. The owner may revisit any item, in particular the email provider (item 4) and the retention periods (item 9).

## Decisions

1. **PostgreSQL holds the feed; Firestore mirrors it.**
   - A `notifications` table (migration 0006) is written in the **same transaction** as the event it reports. A notification therefore exists exactly when its event was committed, and a rolled-back request leaves none.
   - After commit, the row is mirrored to Firestore (`notifications/{user_id}/items/{id}` with `{type, title, body, link, created_at, read}`, as backend.md §7 specifies) and, where it applies, emailed.
   - This is the "transactional outbox" pattern. It satisfies "write to Firestore after the DB commit; a Firestore failure must never roll back business state" by construction: delivery only ever updates the notification's own delivery columns.
2. **Delivery: one path, retried.**
   - `NotificationService.deliver_due` leases due rows (`FOR UPDATE SKIP LOCKED`, five-minute lease, so two runs never send the same row and a crash mid-delivery is picked up again). It writes the mirror and sends the email outside any transaction, then records what worked.
   - A failure is retried with backoff (2, 4, 8 … minutes, at most 6 hours) up to `NOTIFICATION_MAX_ATTEMPTS` (8), then given up and logged (`notification.gave_up`). Only the error's class name is stored, never a message or payload.
   - A channel that worked isn't repeated: a mirror failure doesn't resend the email, and the reverse.
   - The dispatcher on `app.state` delivers right after a request or job that wrote notifications (`get_db` checks the session's flag after the request), and the `notification_retry` job (every minute) catches anything missed, such as rows written just before a restart.
3. **Feed endpoints (additive to the frozen contract, ADR 0009):** `GET /notifications` (newest first, paged, `unread_only`, with an `unread` count), `POST /notifications/{id}/read` and `POST /notifications/read-all`. Another user's notification is 404. Marking read re-mirrors the row so Firestore shows `read: true`. There's no notification UI yet (the handoff lists none for Phase 1); B7 adds the bell.
4. **Email goes through SMTP**, which every major provider offers (Resend, Brevo, Postmark, SendGrid). The owner's choice of provider is configuration only: `EMAIL_PROVIDER=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`.
   - STARTTLS on 587 (or 2525), implicit TLS on 465; certificates are always verified.
   - The outbox stays refused in staging and production, and choosing `smtp` without its keys fails at startup.
   - If the host blocks outbound SMTP ports, port 2525, which most providers support, is the first fallback; a provider's HTTP API would be a small second sender behind the same interface.
5. **Auth emails stay direct.** Verify-email and reset-password are still sent straight from `AuthService` after commit (B2), not through the notifications table, because their links hold one-time tokens, and storing those would undo hashing them. A failed send is logged and the user can ask again (the existing resend endpoints).
   - **Amended 2026-10-13 (owner-approved audit):**
     - **Sent after the response.** `AuthService` returns the message instead of sending it, and the router passes it to `send_email` with FastAPI `BackgroundTasks`. This covers signup, resend-verification, forgot-password, and reset-password's notice below.
       - Reason: with a real SMTP relay a send takes seconds, so sending inside the request let forgot-password and resend-verification be timed to learn whether an account exists.
       - Responses stay generic (202 with no body, whether or not an account exists).
       - Limit: this removes the provider's latency only. A known account still costs a token write inside the request, so response times aren't guaranteed identical, and the per-email rate limits (3 an hour) stay in place.
     - **Failures are logged as `email.send_failed` with the template and error type only**: no traceback, address, link or token.
     - **"Your password was changed" notice** after a successful reset. It names no password or token and links only to the forgot-password page.
     - **Tests can't reach live services:** the test environment pins `EMAIL_PROVIDER=outbox` and `NOTIFICATIONS_MIRROR=none` over the owner's `.env` (`tests/unit/test_isolation.py`).
6. **What is notified, and to whom.** The other party is told; nobody is notified of their own action. Texts and links live in `modules/notifications/messages.py`, and a test checks each link is a route in `routes.ts`. Messages name only what the recipient already sees in the app: no NINs, documents, tokens or card details.

   | Event | Family | Agency | Email |
   | --- | --- | --- | --- |
   | Proposal received | ✓ | | ✓ |
   | Proposal accepted (hold, or free replacement) | | ✓ | ✓ |
   | Fee paid, trial started | ✓ | ✓ | ✓ |
   | Hold lapsed (job) / cancelled by the family | lapsed only | ✓ | family only |
   | Trial ending (job, `TRIAL_REMINDER_DAYS`=2 before) | ✓ | ✓ | ✓ |
   | Confirmed / replacement requested | | ✓ | ✓ |
   | Ended | the other side; both if a super admin ended it | | ✓ |
   | Late payment refunded | ✓ | | ✓ |
   | Agency approved, rejected, suspended, reinstated | | ✓ | ✓ |
   | Check flagged / checks expired (job) | | ✓ | ✓ |
   | Subscription past due or ended | | ✓ | ✓ |

   Suspended accounts still get the feed but no email.
7. **Jobs run inside the API with APScheduler 3**, as backend.md §8 proposes. They're defined in `app/jobs/registry.py`, schedules are in WAT, and each job calls services, never repositories.
   - Each run takes a Redis lock (`SET hv:job:<name> NX EX`), released only by the run that took it. Two instances, or a manual run during a scheduled one, never overlap.
   - `coalesce` folds missed runs into one, and `max_instances=1` stops a slow run overlapping the next.
   - A failing job is logged (`job.failed`) and never stops the scheduler or the API.
   - `JOBS_ENABLED` (default true; tests turn it off and run jobs themselves). `uv run python -m app.jobs run <name>` runs a job once under the same lock, and `list` shows them.

   | Job | When (WAT) | Does |
   | --- | --- | --- |
   | `expire_holds` | every minute | Unpaid holds past `hold_expires_at` → `cancelled` (`payment_expired`); the request reopens |
   | `trial_reminders` | 08:00 | Both sides, `TRIAL_REMINDER_DAYS` before the trial ends; once per trial (dedupe key); a missed day is caught up |
   | `verification_expiry` | 02:00 | Lapsed checks → `expired` (the trigger delists, rule 1); the agency is told which |
   | `subscription_sync` | hourly | Reconciles with Paystack (B5); tells the agency if it lapses |
   | `notification_retry` | every minute | Delivers due notifications |
   | `refund_retry` | every 15 minutes | Retries refunds Paystack refused, up to `REFUND_MAX_ATTEMPTS` (10), then logs `payment.refund_gave_up` for an admin |
   | `document_retention` | 03:00 | Retention (item 9), then destroys deleted evidence in Cloudinary |

   Every job is safe to run late, twice, or after a gap, because each looks at "everything due by now". This matters because a host that sleeps when idle (Render's free tier) stops in-process jobs; see Consequences.
8. **Refunds are tracked** (`payments.refund_sent_at`, `refund_attempts`), which closes the gap B5 left (ADR 0014 item 3). The attempt is counted before Paystack is called, so a crash between the two can't retry forever. A payment is refunded at most once: a refund that went through is never sent again.
9. **Retention (NDPA storage limitation; periods decided by the owner: 90 days on 2026-10-11, and 12 months for idle workers on 2026-10-13, down from the proposed 24. The owner left the number to Claude Code, which chose 12 because references and address checks expire after 12 months, so an idle worker's file can't support a listing beyond that).**
   - Evidence on a check **rejected more than `RETENTION_REJECTED_EVIDENCE_DAYS` (90) days ago** is soft-deleted. A rejected check changes only when it reopens, so its `updated_at` is when it was rejected.
   - **All evidence of an unlisted worker with no active placement and nothing happening for `RETENTION_IDLE_WORKER_MONTHS` (12) months** (no edit, no placement starting or ending) is soft-deleted. Their verified checks become `expired`, so the worker can only be listed again after fresh evidence is checked (rule 1). Each such deletion is in the audit log (`worker.evidence_deleted`, actor: system).
   - **Soft-deleted evidence is destroyed in Cloudinary** (Upload API `destroy`, with CDN invalidation) and stamped `purged_at`. A failure is retried the next night. This also covers documents an agency removes, which until now stayed in Cloudinary.
   - Listed workers and workers in a placement are never touched.
   - Anonymising ended placements after 6 years isn't implemented: nothing can be that old before 2032. It's recorded as a known gap.
10. **Firestore is a small REST client** (`httpx` plus a service-account JWT signed RS256 with PyJWT, exchanged for an hour-long access token), not the Firebase Admin SDK, as with Paystack and Cloudinary. The whole document is written each time, so a retry is harmless. Neither the key, the tokens nor response bodies are logged. Off by default (`NOTIFICATIONS_MIRROR=none`). The owner's project `helpverified` passed the live check on 2026-10-12. The browser will read the mirror in B7, which needs Firebase custom tokens and security rules (`request.auth.uid == userId`); until then Firestore's production-mode default (deny all clients) applies, and the server's service account isn't subject to rules.
11. **Cache: nothing to cache yet.** backend.md §9 allows caching only read-heavy, non-personal data (service catalogue, public agency profile). No such endpoint exists, because every current read is personal or role-scoped, so no cache was added. Worker availability is never cached.

## Consequences

- New dependencies: `apscheduler` 3.11 and `cryptography` (through `pyjwt[crypto]`). APScheduler 3 ships no type information, so mypy is told to skip it.
- **Hosting: Render Cron Jobs (owner, 2026-10-13).** The in-process scheduler needs an API instance that stays up, so in production the jobs run as Render Cron Jobs calling `python -m app.jobs run <name>` (same code, same Redis lock), and the web service runs with `JOBS_ENABLED=false`. Locally the in-process scheduler stays on. Each cron run drains the notifications it wrote before exiting. Planned schedules, converted to UTC (WAT is UTC+1, with no daylight saving), to be set up in B8:

  | Job | WAT | Cron (UTC) |
  | --- | --- | --- |
  | `expire_holds` | every minute | `* * * * *` |
  | `notification_retry` | every minute | `* * * * *` |
  | `refund_retry` | every 15 min | `*/15 * * * *` |
  | `subscription_sync` | hourly | `0 * * * *` |
  | `verification_expiry` | 02:00 | `0 1 * * *` |
  | `document_retention` | 03:00 | `0 2 * * *` |
  | `trial_reminders` | 08:00 | `0 7 * * *` |

  To check or decide in B8:
  - Render's current cron pricing, minimum interval and time zone, since the two every-minute jobs start a container each minute. If that is too costly, they could move to a less frequent schedule or one combined command, without changing the jobs.
  - Two cron runs overlapping: the Redis lock skips the second, but `python -m app.jobs` then exits with code 1, which Render would show as a failed run. A skipped run should exit 0.
  - The holds' 30-minute window and the reminders tolerate a late run, because every job handles "everything due by now".
- With several API instances, each runs a scheduler; the Redis lock makes that harmless.
- B7 must: add a label for the audit action `worker.evidence_deleted` in `apps/web/src/features/admin/status.ts`, mint Firebase custom tokens, and add the notification bell.
