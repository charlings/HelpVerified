# 0006 — Admin moderation: agency status moves, suspension, flags and the audit log

- **Status:** Accepted
- **Date:** 2026-10-05 (M7)
- **Decided by:** Owner, approving the M7 plan; details settled during the build

## Decision

- **Agency moves:** `pending → approved | rejected`, `approved → suspended`, `suspended → approved` (reinstate). Rejected is final in v1. Reject and suspend need a reason, stored as `agencies.status_reason` and shown to the agency. Buttons come from `allowed_actions` on the agency.
- **Suspension:** listed workers become `suspended` (hidden from families), pending proposals are withdrawn, running placements continue. Reinstating returns those workers to `delisted`; the agency relists them through the four-check gate.
- **Flagging a check:** only a `verified` check, with a reason. It returns to `submitted`, the worker is delisted (rule 1), a running placement continues. Stored as `verification_items.flag_reason` and `flagged_at`, shown to the agency, cleared when the agency verifies again. (Not `rejection_reason`: the check isn't rejected, it's back in review.)
- **Admin ending a placement** is recorded as a new end reason, `admin_ended` ("Ended by HelpVerified"), not `agency_ended`.
- **Audit log:** admin actions on agencies, flags, admin-ended placements, and every document view by anyone (`document.viewed`, alongside `document_access_log`).

## Consequences for the backend

Schema changes beyond `database.md`: `agencies.status_reason text NULL`; `verification_items.flag_reason text NULL`, `flagged_at timestamptz NULL`; `placement_end_reason` gains `admin_ended` (an `ALTER TYPE … ADD VALUE`, outside a transaction). See `docs/backend-handoff.md`.
