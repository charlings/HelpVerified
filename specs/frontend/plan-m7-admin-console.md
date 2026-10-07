# Plan: M7 — Admin console

**Spec:** `specs/frontend/project-helpverified-web.md` (requirement 16; acceptance "non-admin visiting `/admin` lands on 403"; milestone M7)
**Status:** Approved 2026-10-05 · Built 2026-10-05 (Stages A and B) · Signed off 2026-10-06

## Objective

A super admin can oversee HelpVerified against the mock API: see what needs attention, approve, reject, suspend and reinstate agencies, review any worker's checks and evidence and flag a check that shouldn't have passed, follow every placement and end one if needed, and read an audit log of every admin action. Every action asks for confirmation first, and the reasons are recorded. Non-admins get the 403 page.

Out of scope: emails to the agency on approval or suspension (B6), suspending individual user accounts (`POST /admin/users/{id}/suspend`; it has no screen in the spec, so it waits for the backend), data export and deletion requests (B8), editing agency details.

## Delivery in two stages

- **Stage A — Overview and agencies:** admin overview, agencies list with a status filter, agency detail with approve / reject / suspend / reinstate, and the audit-log write path in the mock.
- **Stage B — Workers, placements and the audit log:** workers across all agencies with flagging and logged document viewing, placements across all agencies with admin end, the audit log screen, and the e2e tests.

## Decisions needing approval

1. **Agency status moves.** `pending → approved` (Approve) or `→ rejected` (Reject, reason required). `approved → suspended` (Suspend, reason required). `suspended → approved` (Reinstate). Rejected is final in v1: the agency contacts support. Buttons come from `allowed_actions` on the agency, computed by the mock, the same pattern as placements.
2. **What suspending an agency does.** Its listed workers become `suspended` and disappear from families' proposals, its pending proposals are withdrawn, and it gets `AGENCY_NOT_ACTIVE` on listing and proposing (already enforced since M5). **Active placements keep running**: the family isn't punished for the agency's suspension, the same way delisting doesn't end a placement. Reinstating does **not** relist workers automatically; the agency relists them and the four-check gate applies again.
3. **What flagging a worker's check does.** The admin flags one `verified` check with a reason. It goes back to `submitted` with the reason shown to the agency, and because the worker no longer has 4 of 4, they're delisted automatically (rule 1). An active placement isn't ended (the CLAUDE.md gotcha). The agency must re-verify the check before relisting.
4. **Admins can view verification documents**, through the same short-lived-URL viewer agencies use, and every view writes `document.viewed` to the audit log. Families still never see documents.
5. **The audit log records**: agency approve, reject, suspend, reinstate; worker check flagged; document viewed (by anyone); placement ended by an admin. Each entry has actor, action, entity, entity link, reason and time. The seed adds a short history so the screen isn't empty. Placement state changes by families and agencies stay in each placement's timeline rather than duplicating them here.
6. **Admin overview** shows counts that lead somewhere: agencies awaiting approval (links to the filtered list), listed workers, active placements, trials ending in the next 3 days, placement fees paid this month (demo amounts), plus the pending-approval queue and the five latest audit entries.
7. **Admin placement detail reuses `PlacementDetailScreen`** with `viewer="super_admin"`. The admin sees the worker's full name, the family and the agency, and can End (reason required). Admins don't confirm, pay or request replacements; those belong to the family.
8. **Seed additions:** one pending agency ("Bright Hands Agency", admin `newagency@demo.hv`) and one suspended agency, so every status can be demonstrated. The mock database key moves to `hv-mock-db-v4`, so open demo tabs start fresh.

## Screens

| Route | Content | Key states |
| --- | --- | --- |
| `/admin` | Counts above; pending-approval queue; latest audit entries | Skeleton · nothing pending · error |
| `/admin/agencies` | Table → cards: name, CAC number, state, roles, status, workers, applied on; filter by status (default: pending first) | Skeleton · empty per filter · error |
| `/admin/agencies/[id]` | Business details, contact, address, roles, subscription, worker counts by listing status, status history; Approve / Reject / Suspend / Reinstate with confirmation dialogs | Not found · `ILLEGAL_TRANSITION` (someone else acted first) |
| `/admin/workers` | Table → cards: worker, agency, role, checks 0–4, listing status; filter by agency, role, listing status; open a worker to review checks, view documents (logged) and flag a verified check | Skeleton · empty · error · document link expired |
| `/admin/placements` | M5 list with `viewer="super_admin"`: worker, family, agency, status, dates; status filter | Skeleton · empty · error |
| `/admin/placements/[id]` | M5 detail with `viewer="super_admin"`; End | `ILLEGAL_TRANSITION` |
| `/admin/audit-log` | Table → cards: time, actor, action, entity (linked), reason; filter by action; paginated | Skeleton · empty · error |

`/admin/workers/[id]` is new (worker review). It needs a route `routes.admin.worker(id)`, recorded in the route map. `routes.admin.placement(id)` is added the same way.

## Steps

### Stage A
1. **Mock domain:** agency `allowed_actions`; `GET /admin/overview`; `GET /admin/agencies?status=`; `GET /admin/agencies/{id}`; `POST /admin/agencies/{id}/approve | reject | suspend | reinstate` with reasons, the suspension effects (decision 2) and audit entries; `audit_log` in the mock database; seed additions (decision 8). Every admin endpoint returns 403 `FORBIDDEN` to other roles.
2. **Feature:** `features/admin` (api, hooks, status maps for agency statuses and audit actions, `AgencyActionDialog`).
3. **Screens:** overview, agencies list, agency detail.
4. **Tests:** mock rules first (each transition and its illegal ones; suspension delists, withdraws proposals and keeps placements; reinstating doesn't relist; audit entries written; non-admins 403); screens for every state above.
5. **Commit Stage A.**

### Stage B
6. **Mock domain:** `GET /admin/workers` (all agencies, filters), `GET /admin/workers/{id}` (with checks and document metadata), `POST /admin/workers/{id}/flag` `{kind, reason}`, admin access to `GET /documents/{id}/url` (logged), `GET /admin/placements`, admin End on placements, `GET /admin/audit-log?action=&page=`.
7. **Screens:** workers list and worker review (reusing the verification checklist read-only plus Flag), placements list and detail with `viewer="super_admin"`, audit log.
8. **Tests:** flag → delisted, placement untouched, agency sees the reason; document view writes the audit entry; e2e: approve the pending agency → that agency can list a worker; suspend an agency → its worker disappears from a family's proposals while its active placement remains; flag a check → the worker is delisted; non-admin roles get 403 on every `/admin` route; axe on every screen and dialog at 375 and 1280 px.
9. **Docs and report:** route map, architecture, API contract (admin endpoints, agency `allowed_actions`, audit actions), CHANGELOG M7, CLAUDE.md. **Commit Stage B.**

## M7 acceptance criteria (from the testing reference)

- [x] Overview, agencies list/approve/suspend, worker flags, placements, audit log
- [x] Non-admin gets the 403 page
- [x] Actions show confirmation dialogs
- [x] lint, typecheck, unit tests, build, Chromium e2e + axe all pass (see `docs/CHANGELOG.md` M7 §5)

## Risks

- **Cross-role e2e in one tab** (approve, then sign in as the agency) uses the same sign-out-and-in approach as the M6 journey.
- **Suspension effects touch M5 and M6 data** (listings, proposals). The existing agency and family suites run in full after Stage A to catch regressions.
