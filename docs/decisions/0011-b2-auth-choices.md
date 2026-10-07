# 0011 — B2 auth choices

- **Status:** Accepted
- **Date:** 2026-10-07 (B2)
- **Decided by:** Owner (items 1 and 2), Claude Code during B2 (the rest). Owner may revisit any item.

## Decisions

1. **Google sign-in is deferred to its own stage, before B7** (owner). It needs a Google Cloud OAuth client, which the owner creates, and a web page where new Google users choose family or agency. Neither exists, and the page would add to the frozen contract (ADR 0009), which that stage's own ADR will cover. Until then, the web app's Google button keeps its "not available yet" message, and `users.google_sub` is in the schema, unused.
2. **Local Redis is the `redis-windows` 7.4.x build** (owner), run from `%LOCALAPPDATA%\redis7` by `apps/api/scripts/redis-portable.ps1` with no admin rights. That's the same major version as `docker-compose.yml` and CI (`redis:7`). The script listens on both `127.0.0.1` and `::1`: on Windows, `localhost` tries `::1` first and a refused attempt costs about 2 s per connection.
3. **Email is an interface; development writes to an outbox.** `EMAIL_PROVIDER=outbox` writes each message as JSON to `apps/api/.outbox/` (git-ignored). Settings refuse the outbox in staging and production, so a deploy can't silently drop emails before B6 adds a provider. Emails are sent after the commit, and a failed send is logged without the link (which carries the token). The user can ask for a new link.
4. **`POST /auth/logout` uses the refresh cookie and doesn't need a bearer token.** The contract table says "auth", but the mock the frontend was signed off against doesn't require one, and requiring it would stop people signing out once their 15-minute access token has expired. Endpoint, method and response (204) are unchanged.
5. **CSRF on the cookie endpoints** (`/auth/refresh`, `/auth/logout`): `SameSite=Lax`, plus an `Origin` check. A request whose `Origin` isn't the web app or a `CORS_ORIGINS` entry gets 403 `FORBIDDEN`. Requests with no `Origin` (non-browser clients) are allowed, because browsers always send it on cross-site POSTs.
6. **Rate limits run before credentials are checked**, so a correct password still waits out the window. Rejected attempts don't extend the window, and bodies that fail validation (422) never reach the limiter. Login and signup share the `auth` scope per IP and email. Forgot-password and resend-verification share the `email` scope per email. Signed-in calls are limited per user in `get_current_user`. Redis keys hold SHA-256 hashes, never emails or IPs. All limits are settings (`RATE_LIMIT_*`).
7. **Refresh tokens:** each rotation issues a new token with a fresh 14-day expiry, so the session slides. Reuse detection is strict, with no grace period: presenting a rotated token revokes the whole family. Known trade-off: two browser tabs refreshing at the same moment can sign the user out. The web client refreshes once per 401, which keeps this rare. Revisit with a short grace window if it shows up in B7.
8. **`UserOut` gains `phone`**, an additive field (allowed by ADR 0009). `agency` is always `null` until B3 creates agencies.
9. **`users` gains `privacy_notice_version` and `privacy_accepted_at`** (spec requirement 22). They're set at signup, and `database.md` is updated.
10. **The refresh cookie is `Secure` only in staging and production** (`Settings.is_deployed`), because development runs on plain-http localhost. Production must serve the web app and API on the same site (for example `helpverified.ng` and `api.helpverified.ng`), or browsers won't send a `SameSite=Lax` cookie on the refresh call. That goes on the B8 deploy checklist.
11. **Forgot-password does nothing for suspended accounts** and still returns 202. Suspended users can't sign in, so a reset link would only confuse them.
12. **Resources live on `app.state`, created in the app's lifespan** (engine, Redis client, email sender). Each app instance, and each test's app, owns its own pools. No module-level connection globals.

## Consequences

- After a reboot, local development needs `pg-portable.ps1 start` and `redis-portable.ps1 start`.
- `require_verified_email` and `require_role` are ready for B3 (agency onboarding) and B4 (family requests).
