# Security and compliance reference

Contents: 1. Data classification · 2. NDPA design obligations · 3. Verification documents · 4. Auth and session security · 5. Payments · 6. Web and API hardening · 7. Secrets · 8. Incident basics

## 1. Data classification

| Class | Examples | Storage | Who sees it |
| --- | --- | --- | --- |
| Restricted | ID scans, guarantor forms, reference letters, address proof, raw NIN (never stored) | Cloudinary `authenticated`; NIN only as HMAC hash + last 4 | Owning agency admins and super admins, every view logged |
| Confidential | Worker phone, home addresses, family address, payment records | Postgres | Parties to the placement, admins |
| Internal | Worker profile, verification statuses, request details | Postgres | Role-scoped |
| Public | Marketing content, agency public name | Static / Postgres | Anyone |

Families see verification **outcomes** (badges with dates), never documents or document metadata.

## 2. NDPA design obligations

The Nigeria Data Protection Act 2023 and the NDPC's implementation directive apply because the platform processes Nigerian data subjects' identity data. The research document must cite the exact sections from the official text; this file records the engineering consequences. Verify every section number against the Act before quoting it anywhere user-facing.

| Obligation (principle) | Implementation |
| --- | --- |
| Lawful basis and consent | Agency confirms, per worker, that the worker consented to collection and platform sharing (checkbox + timestamp stored on the worker; consent form template downloadable). Families and agencies accept the privacy notice at signup (version stored). |
| Purpose limitation and minimisation | Collect only what the four checks need. No raw NIN, no BVN, no biometric data. Free-text fields warn against entering extra ID numbers. |
| Storage limitation | Retention: documents of workers with no placement for 12 months (owner, 2026-10-13; ADR 0015), and of rejected items after 90 days, are deleted by a job (configurable). Ended placements keep records 6 years for disputes; then anonymise. Document retention rules in `docs/privacy-retention.md`. |
| Security of processing | Encryption in transit (TLS everywhere), at rest (managed Postgres + Cloudinary), access control by role and tenant, signed short-lived URLs, access logging, least-privilege API keys. |
| Data subject rights | Admin tools to export and delete a worker's or user's data on request; deletion removes Cloudinary assets and anonymises rows that must stay for audit. |
| Processors | Cloudinary, Paystack, Firebase, email provider listed in the privacy notice with purpose; keep their DPAs on file. |
| Impact assessment | Identity documents at scale are high-risk processing: produce a short DPIA in `docs/dpia.md` before production. |
| Breach notification | Runbook in `docs/incident.md`: assess, contain, notify the regulator and affected people within the statutory window. |

## 3. Verification documents

- Upload: API issues a signed upload signature restricted to folder `workers/docs/<worker_id>/<kind>`, `type=authenticated`, allowed formats jpg/png/pdf, max 10 MB. Client uploads directly to Cloudinary.
- Registration: API verifies the asset (folder, type, size, format) via Cloudinary Admin API before inserting `verification_documents`.
- Viewing: `GET /documents/{id}/url` → permission check → `document_access_log` row → signed URL (`sign_url=True`, 5 min). URLs are never stored, cached or logged.
- Deletion: soft delete in DB, destroy in Cloudinary via job (so a failed Cloudinary call can retry).
- Worker photos are public assets but in a separate folder; never put a document in the photo folder.

## 4. Auth and session security

- argon2id password hashing; constant-time comparisons; generic login error message.
- Access token 15 min in memory; refresh token httpOnly, Secure, SameSite=Lax, rotated, reuse detection.
- CSRF: state-changing requests use bearer tokens (not cookies), so CSRF applies only to `/auth/refresh` and `/auth/logout`; protect them with SameSite plus an `Origin` check against `WEB_BASE_URL`.
- One-time tokens (verify, reset) are random, hashed at rest, single-use, 1 h (reset) / 24 h (verify).
- Lock out with backoff after repeated failed logins (rate limiter) rather than permanent lock.
- Admin actions (approve, suspend, flag, document view) always write `audit_log`.

## 5. Payments

- Card data never touches our servers; Paystack Checkout/Popup only.
- Webhooks: verify `x-paystack-signature` (HMAC-SHA512, secret key) on the **raw** body before JSON parsing; reject otherwise with 401 and log.
- Idempotency: `webhook_events UNIQUE(provider, event_id)` and `payments.paystack_reference UNIQUE`.
- Always call `verify_transaction` and compare amount, currency and status before granting value.
- Test keys in all non-production environments. Live keys only on production, set in the host's secret store. The demo plan (live or test) is the owner's decision and must be recorded in an ADR.

## 6. Web and API hardening

- Security headers on web (Next.js `headers()`): CSP with `img-src 'self' res.cloudinary.com data:`, `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal.
- API: CORS allow-list from `CORS_ORIGINS`, credentials only for the web origin; request body limit 1 MB; Pydantic strict types; SQLAlchemy parameterised queries only (no f-string SQL).
- Tenant isolation tests: for each resource type, an agency/family from another tenant gets 404.
- Rate limits per `references/backend.md` §9.
- Dependencies: Dependabot or Renovate; `pnpm audit` and `pip-audit` in CI (warn on moderate, fail on high).

## 7. Secrets

- `.env` files are git-ignored; `.env.example` lists every key with a safe placeholder and a comment.
- Web only exposes `NEXT_PUBLIC_*` keys: API base URL, Paystack public key, Cloudinary cloud name, mocking flag. Nothing else.
- Rotate `JWT_SECRET` and `NIN_PEPPER` procedures documented; `NIN_PEPPER` rotation requires rehash job, so treat it as long-lived.
- Run `gitleaks` in CI.

## 8. Incident basics

`docs/incident.md` covers: who to contact, how to revoke all sessions (bump a `token_version`), how to rotate Cloudinary and Paystack keys, how to disable listing platform-wide (feature flag), and breach notification steps.
