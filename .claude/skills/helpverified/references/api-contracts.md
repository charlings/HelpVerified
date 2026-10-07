# API contracts

Base URL `/api/v1`. JSON only (except uploads, which go to Cloudinary directly). OpenAPI at `/docs` is the source of truth; `packages/contracts` is generated from it with `openapi-typescript` and committed. In Phase 1 the MSW handlers in `apps/web/src/mocks` implement exactly these shapes.

Contents: 1. Conventions · 2. Error codes · 3. Endpoints · 4. Key payloads · 5. Phase 1 → Phase 2 switch

## 1. Conventions

- IDs are UUID strings; timestamps ISO 8601 UTC; dates `YYYY-MM-DD`; money as integer kobo with field suffix `_kobo`.
- Field names snake_case on the wire. The web client keeps snake_case types (generated) and maps to UI labels in feature code; do not hand-convert casing.
- Lists: `?page=1&page_size=20` (max 100) → `{ "items": [...], "page": 1, "page_size": 20, "total": 57 }`.
- Filters as query params (`status=trial&role=nanny`); sort `?sort=-created_at`.
- Success returns the resource directly (no `data` wrapper). Errors use the envelope in §2.
- Mutations that can be retried by the client (accept, pay, confirm) accept an `Idempotency-Key` header; the server stores key + response for 24 h in Redis.

## 2. Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Malformed but parseable request |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired access token |
| 401 | `INVALID_CREDENTIALS` | Login failed (same message whether email exists or not) |
| 403 | `FORBIDDEN` | Role not allowed |
| 403 | `EMAIL_NOT_VERIFIED` | Action requires verified email |
| 403 | `ACCOUNT_SUSPENDED` | User suspended |
| 403 | `AGENCY_NOT_ACTIVE` | Agency not approved or subscription inactive |
| 404 | `NOT_FOUND` | Missing, or belongs to another tenant |
| 409 | `WORKER_NOT_VERIFIED` | Listing/proposing a worker without 4/4 verified items |
| 409 | `WORKER_UNAVAILABLE` | Worker has an active placement |
| 409 | `WORKER_NOT_LISTED` | Proposing a draft/delisted worker |
| 409 | `DUPLICATE_WORKER` | NIN already on the platform |
| 409 | `ILLEGAL_TRANSITION` | State change not allowed from current state |
| 409 | `REQUEST_NOT_OPEN` | Proposal or accept on a matched/closed request |
| 409 | `REPLACEMENT_WINDOW_CLOSED` | Replacement requested too late |
| 409 | `EVIDENCE_REQUIRED` | Verifying an item with no document |
| 409 | `EMAIL_TAKEN` | Signup with existing email |
| 409 | `AGENCY_EXISTS` | `POST /agencies` when the caller already has an agency |
| 409 | `ALREADY_PROPOSED` | The same worker is already proposed for this request (`UNIQUE (request_id, worker_id)`); a withdrawn proposal can be re-proposed |
| 410 | `TOKEN_EXPIRED` | Reset / verify token expired or used |
| 422 | `VALIDATION_ERROR` | Schema validation; `details.fields: {field: [messages]}` |
| 429 | `RATE_LIMITED` | Too many requests |
| 502 | `PAYMENT_PROVIDER_ERROR` | Paystack unreachable or rejected |
| 500 | `INTERNAL_ERROR` | Anything unexpected |

The web app maps each code to a user-facing message in `apps/web/src/lib/error-messages.ts`; components never show raw codes.

## 3. Endpoints

### Auth `/auth`
| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/auth/signup` | public | `{email, password, full_name, role: family|agency_admin}` → 201, sends verify email |
| POST | `/auth/login` | public | → `{access_token, user}`, sets refresh cookie |
| POST | `/auth/refresh` | cookie | rotates, → `{access_token}` |
| POST | `/auth/logout` | auth | revokes refresh family |
| POST | `/auth/verify-email` | public | `{token}` → `{verified: true, role}` (role lets the UI route agencies to onboarding) |
| POST | `/auth/resend-verification` | public | always 202 |
| POST | `/auth/forgot-password` | public | always 202 |
| POST | `/auth/reset-password` | public | `{token, password}` |
| GET | `/auth/google/start`, `/auth/google/callback` | public | OAuth |
| GET | `/me` | auth | user + role context (agency/family summary) |
| PATCH | `/me` | auth | name, phone |

### Agencies
| Method | Path | Role |
| --- | --- | --- |
| POST | `/agencies` | agency_admin (onboarding, once) |
| GET / PATCH | `/agencies/me` | agency_admin |
| GET | `/agencies/me/dashboard` | agency_admin — counts by worker status, open requests, trials ending |
| GET | `/admin/agencies` | super_admin, `?status=` |
| POST | `/admin/agencies/{id}/approve` · `/reject` · `/suspend` | super_admin |

### Workers and verification (agency)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/workers` | own agency; `?role=&listing_status=&available=true` |
| POST | `/workers` | `{full_name, role, years_experience, nin, …}` → creates 4 items |
| GET / PATCH | `/workers/{id}` | |
| GET | `/workers/{id}/verification` | 4 items with status, documents meta (no URLs) |
| PATCH | `/workers/{id}/verification/{kind}` | `{details}` or `{status: submitted|verified|rejected, rejection_reason?}` |
| POST | `/uploads/signature` | `{purpose: worker_photo|verification_doc, worker_id, kind?}` → Cloudinary signed params |
| POST | `/workers/{id}/verification/{kind}/documents` | `{public_id}` after upload |
| DELETE | `/workers/{id}/verification/{kind}/documents/{doc_id}` | soft delete; item back to `submitted` if it was verified |
| GET | `/documents/{doc_id}/url` | → `{url, expires_at}`; logged |
| POST | `/workers/{id}/list` · `/delist` | gate enforced |
| POST | `/admin/workers/{id}/flag` | super_admin; sets item back to `submitted` |

### Requests and proposals
| Method | Path | Role |
| --- | --- | --- |
| POST | `/requests` | family |
| GET | `/requests` | family: own; agency: open requests matching roles + state |
| GET | `/requests/{id}` | owner family, matching agency, admin |
| POST | `/requests/{id}/cancel` | family |
| POST | `/requests/{id}/proposals` | agency; `{worker_id, note}` |
| GET | `/requests/{id}/proposals` | family owner: all; agency: own |
| POST | `/proposals/{id}/withdraw` | agency |
| POST | `/proposals/{id}/decline` | family |
| POST | `/proposals/{id}/accept` | family → `{placement, payment: {authorization_url, reference} | null}` |
| GET | `/workers/{id}/public` | family who received a proposal for this worker: profile + badge statuses only |

### Placements
| Method | Path | Role |
| --- | --- | --- |
| GET | `/placements` | scoped by role; `?status=` |
| GET | `/placements/{id}` | parties + admin; includes `events[]` and `allowed_actions[]` for the caller |
| POST | `/placements/{id}/confirm` | family |
| POST | `/placements/{id}/end` | family, agency, admin; `{reason}` |
| POST | `/placements/{id}/replacement` | family; `{reason}` → `{placement, new_request}` |

`allowed_actions` is computed on the server from the state machine and the caller's role. The UI renders buttons from it rather than re-deriving rules.

### Payments and billing
| Method | Path | Role |
| --- | --- | --- |
| GET | `/payments` | own |
| GET | `/payments/{reference}/verify` | payer (used on Paystack callback page) |
| POST | `/billing/subscription` | agency_admin → Paystack authorization URL |
| GET | `/billing/subscription` | agency_admin |
| POST | `/webhooks/paystack` | Paystack only (signature) |

### Admin and misc
`GET /admin/overview`, `GET /admin/placements`, `GET /admin/audit-log`, `POST /admin/users/{id}/suspend`, `POST /contact` (public, rate-limited), `GET /health`.

### Added during Phase 1 (frontend M6–M7)
Endpoints the frontend uses that the original tables above didn't list. Payloads are in the notes below each milestone.

| Method | Path | Role |
| --- | --- | --- |
| GET | `/families/me` | family — `{id, name, state, lga}` or `null` before the first request |
| GET | `/families/me/dashboard` | family — active placements, open requests |
| POST | `/placements/{id}/cancel` | family — cancel an unpaid hold; `{reason}` |
| POST | `/placements/{id}/pay` | family — resume checkout for an unpaid hold → `{authorization_url, reference}` |
| GET | `/admin/overview` | super_admin — counts, approval queue, recent audit |
| GET | `/admin/agencies/{id}` | super_admin — detail with `allowed_actions` and history |
| POST | `/admin/agencies/{id}/reinstate` | super_admin — suspended → approved |
| GET | `/admin/workers` | super_admin — all agencies; `?agency_id=&role=&listing_status=` |
| GET | `/admin/workers/{id}` | super_admin — worker with checks (document metadata only) |
| GET | `/admin/audit-log` | super_admin — `?action=&page=` |
| POST | `/contact` | public, rate-limited |

Not part of the API: `/__mock/paystack/*` exist only in the mock, standing in for Paystack's hosted checkout and webhook (`/demo/checkout`).

Admin payloads (M7; every `/admin/*` call from another role → 403 `FORBIDDEN`):

```jsonc
// GET /admin/overview
{ "agencies_pending", "workers_listed", "placements_active", "trials_ending_soon" /* next 3 days */,
  "fees_paid_this_month_kobo", "pending_agencies": AdminAgencySummary[], "recent_audit": AuditEntry[5] }
// GET /admin/agencies?status=&page= → Paginated<AdminAgencySummary>, pending first, then newest
// AdminAgencySummary: { "id", "name", "cac_number", "state", "lga", "roles_offered", "status", "workers_total", "created_at" }
// GET /admin/agencies/{id} → AdminAgencySummary + { "email", "phone", "address_line", "approved_at", "status_reason",
//   "admin": { "full_name", "email" }, "subscription", "workers": { total, draft, listed, delisted, suspended },
//   "active_placements", "history": AuditEntry[], "allowed_actions": ("approve"|"reject"|"suspend"|"reinstate")[] }
// POST /admin/agencies/{id}/approve | reject | suspend | reinstate   { "reason" } (required for reject and suspend) → agency detail
// AuditEntry: { "id", "action", "actor": { id, name, role } | null, "entity", "entity_id", "entity_label", "worker_id", "reason", "created_at" }
```

```jsonc
// GET /admin/workers?agency_id=&role=&listing_status=&page= → Paginated<WorkerOut & { "agency": { "id", "name" } }>
// GET /admin/workers/{id} → that + { "checks": VerificationItemOut[] }   (document metadata only, never URLs)
// POST /admin/workers/{id}/flag { "kind", "reason" } → worker detail
// GET /admin/audit-log?action=&page= → Paginated<AuditEntry>, newest first
// VerificationItemOut gains "flag_reason", "flagged_at" (shown to the owning agency; cleared on re-verify)
// PlacementOut.end_reason gains "admin_ended" (super admin ended it; needs an enum migration in the backend)
```

Flag: only a `verified` check (else `ILLEGAL_TRANSITION`), reason ≥ 5 characters; the check returns to `submitted`, the worker is delisted (rule 1), a running placement continues. Admins end placements through the shared `POST /placements/{id}/end`. Every `GET /documents/{id}/url` writes `document_access_log` **and** a `document.viewed` audit entry.

Agency moves: `pending → approved | rejected`, `approved → suspended`, `suspended → approved` (reinstate); rejected is final; an illegal move (someone acted first) → 409 `ILLEGAL_TRANSITION`. Suspending sets listed workers to `suspended`, withdraws pending proposals and leaves active placements running; reinstating sets those workers to `delisted`. `status_reason` is returned to the agency in `GET /agencies/me/dashboard`. Audit actions: `agency.approved|rejected|suspended|reinstated`, `worker.check_flagged`, `document.viewed`, `placement.ended`.

`POST /contact` body: `{ name (≥2), email, phone? (+, digits, spaces, ()-, 7–20 chars), topic: family|agency|partnership|press|other, message (20–2000) }` → `202 { "received": true }`; invalid → 422 `VALIDATION_ERROR` with `details.fields`. Mirrors `apps/web/src/features/marketing/contact/schemas.ts` (implemented by the MSW handler in M3).

## 4. Key payloads

```jsonc
// WorkerOut (agency view)
{ "id": "…", "full_name": "Amaka Obi", "role": "nanny", "years_experience": 6,
  "languages": ["English","Igbo"], "live_in_ok": true, "state": "Lagos", "lga": "Ikeja",
  "photo_url": "https://res.cloudinary.com/…", "nin_last4": "4821",
  "listing_status": "listed", "available": true,
  "verification": { "id": "verified", "guarantor": "verified", "references": "verified", "address": "verified" },
  "verified_count": 4, "created_at": "…" }

// WorkerPublicOut (family view) — no NIN digits, no documents, no address line
{ "id": "…", "first_name": "Amaka", "role": "nanny", "years_experience": 6, "languages": [...],
  "photo_url": "…", "agency": { "id": "…", "name": "…" },
  "badges": [ { "kind": "id", "verified_at": "2026-09-30" }, … ] }

// PlacementOut
{ "id": "…", "status": "trial", "worker": { …WorkerPublicOut }, "family": { "id": "…", "name": "…" },
  "agency": { "id": "…", "name": "…" }, "trial_starts_on": "2026-10-06", "trial_ends_on": "2026-10-20",
  "confirmed_at": null, "ended_at": null, "end_reason": null, "replacements_used": 0,
  "allowed_actions": ["confirm","request_replacement","end"],
  "events": [ { "from": "pending_payment", "to": "trial", "at": "…", "actor": "system" } ] }
```

```jsonc
// Additions recorded while building the agency workspace (M5)
// WorkerOut also carries: "listed_at", "active_placement": { "id", "status", "trial_ends_on" } | null
// VerificationItemOut (GET /workers/{id}/verification → array of 4)
{ "kind": "guarantor", "status": "submitted", "details": { "name": "…", "phone": "…", "relationship": "…" },
  "verified_at": null, "expires_at": null, "rejection_reason": null,
  "documents": [ { "id": "…", "format": "pdf", "bytes": 182000, "created_at": "…" } ] }   // metadata only, never URLs
// GET /agencies/me/dashboard
{ "agency": { "id", "name", "status" }, "subscription": { "status", "current_period_end" } | null,
  "active": true,   // approved + active subscription: may list and propose
  "workers": { "total", "draft", "listed", "delisted", "suspended" },
  "checks_needing_attention": 3, "open_requests": 2,
  "trials_ending": [ { "id", "worker_name", "family_name", "trial_ends_on" } ] }
```

Verification rules (enforced by the service; mirrored by the mock): details can be edited unless the check is `verified` (409 `ILLEGAL_TRANSITION`); new details or evidence move `not_started`/`rejected`/`expired` → `submitted`; `verified` only from `submitted` with ≥ 1 document (409 `EVIDENCE_REQUIRED`); `rejected` from `submitted` or `verified` with a reason (422 otherwise); removing evidence from a verified check returns it to `submitted`. Any check leaving `verified` delists the worker; active placements continue.

```jsonc
// Family side (M6)
// RequestOut (family): request fields + "proposals_count", "pending_proposals", "replaces_placement_id", "placement_id"
// GET /requests/{id}/proposals (family): withdrawn proposals are not shown; each carries "worker": WorkerPublicOut
// WorkerPublicOut: { "id", "first_name", "role", "years_experience", "languages", "live_in_ok",
//                    "agency": { "id", "name" }, "badges": [ { "kind", "verified_at" } ], "available" }
// POST /proposals/{id}/accept (Idempotency-Key) → 201
{ "placement": { …PlacementOut summary, "status": "pending_payment" | "trial" },
  "payment": { "authorization_url": "https://checkout.paystack.com/…", "reference": "HV-PF-…" } | null }  // null: replacement fee waived
// GET /payments/{reference}/verify (payer only)
{ "reference", "status": "pending|success|failed|refunded", "amount_kobo", "placement_id", "placement_status" }
// Family placement actions (all return PlacementOut unless noted; 404 for another family's placement)
// POST /placements/{id}/confirm (Idempotency-Key)        trial → confirmed
// POST /placements/{id}/cancel { "reason" }              pending_payment → cancelled; request reopens, proposals back to pending
// POST /placements/{id}/pay → { "authorization_url", "reference" }   resumes the existing checkout
// POST /placements/{id}/replacement { "reason" } → { "placement": PlacementOut, "new_request": RequestOut }
// GET /families/me → { "id", "name", "state", "lga" } | null   (null until the first request)
// GET /families/me/dashboard → { "active_placements": PlacementSummary[], "open_requests": RequestOut[] }
```

Replacement: allowed during the trial, or within `REPLACEMENT_WINDOW_DAYS` of confirming (`REPLACEMENT_WINDOW_CLOSED` after). The placement ends with `end_reason = "replaced"`, the original request closes, and a copy opens with `replaces_placement_id`. Reasons are at least 5 characters (`VALIDATION_ERROR` with `fields.reason`). The new placement carries `replacements_used` forward, so the free allowance is per placement fee.

Accept checks, in order: proposal owned (404) → request `open` (`REQUEST_NOT_OPEN`) → proposal `pending` (`ILLEGAL_TRANSITION`) → worker `listed` (`WORKER_NOT_LISTED`) → no active placement (`WORKER_UNAVAILABLE`). Families need a verified email to post requests (`EMAIL_NOT_VERIFIED`). Cancelling a request declines its pending proposals. A `charge.success` after the hold expired marks the payment `refunded` and creates no placement.

## 5. Phase 1 → Phase 2 switch

- `apps/web/src/lib/api-client.ts` is the only place that knows the base URL, attaches the bearer token, refreshes on 401 once, and turns error envelopes into a typed `ApiError { code, message, fields? }`.
- MSW is enabled when `NEXT_PUBLIC_API_MOCKING=enabled`. Phase 2 integration (B7) switches one feature at a time by removing its handlers; the feature code does not change.
- Contract changes go backend-first: change schema → regenerate types → fix TypeScript errors → update MSW fixtures.
