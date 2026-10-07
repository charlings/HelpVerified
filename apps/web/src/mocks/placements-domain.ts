/**
 * Placement and request rules for the mock (database.md §5–7): one active placement per worker,
 * the state machine, hold expiry, and the shapes each role sees.
 */
import type { Role } from "@/config/routes";
import { business } from "@/config/business";
import { allowedActions, canTransition } from "@/features/placements";
import type { PlacementEndReason, PlacementStatus } from "@/types/domain";
import { db, persist, type MockAgency, type MockPlacement, type MockRequest } from "./db";
import { activePlacementFor, nowIso } from "./domain";

type Actor = "family" | "agency" | "admin" | "system";

export function addEvent(
  placement: MockPlacement,
  from: PlacementStatus | null,
  to: PlacementStatus,
  actor: Actor,
  reason: string | null = null,
) {
  db.placementEvents.push({
    id: `pe-${crypto.randomUUID()}`,
    placement_id: placement.id,
    from_status: from,
    to_status: to,
    actor,
    reason,
    created_at: nowIso(),
  });
}

/** Moves a placement through the state machine, writing its event. Returns false for an illegal move. */
export function transition(
  placement: MockPlacement,
  to: PlacementStatus,
  actor: Actor,
  extra: { reason?: string | null; endReason?: PlacementEndReason } = {},
): boolean {
  if (!canTransition(placement.status, to)) return false;
  const from = placement.status;
  placement.status = to;
  if (to === "ended" || to === "cancelled") {
    placement.ended_at = nowIso();
    placement.end_reason = extra.endReason ?? null;
  }
  addEvent(placement, from, to, actor, extra.reason ?? null);
  return true;
}

/** Stand-in for the expire_holds job: unpaid holds past their deadline are cancelled and the request reopens. */
export function applyHoldExpiry() {
  const now = Date.now();
  let changed = false;
  for (const placement of db.placements) {
    if (placement.status !== "pending_payment" || !placement.hold_expires_at) continue;
    if (Date.parse(placement.hold_expires_at) > now) continue;
    transition(placement, "cancelled", "system", { endReason: "payment_expired" });
    const request = db.requests.find((r) => r.id === placement.request_id);
    if (request) request.status = "open";
    for (const p of db.proposals) {
      if (p.request_id === placement.request_id && (p.status === "superseded" || p.status === "accepted")) {
        p.status = "pending";
      }
    }
    for (const pay of db.payments) {
      if (pay.placement_id === placement.id && pay.status === "pending") pay.status = "failed";
    }
    changed = true;
  }
  if (changed) persist();
}

/** Requests an agency may see: open ones for roles it places in its state, plus any it has proposed to. */
export function requestVisibleTo(agency: MockAgency, request: MockRequest): boolean {
  const matches =
    request.status === "open" && agency.roles_offered.includes(request.role) && request.state === agency.state;
  return matches || db.proposals.some((p) => p.request_id === request.id && p.agency_id === agency.id);
}

export function requestOutForAgency(agency: MockAgency, r: MockRequest) {
  return {
    id: r.id,
    role: r.role,
    title: r.title,
    description: r.description,
    schedule: r.schedule,
    live_in: r.live_in,
    state: r.state,
    lga: r.lga,
    budget_min_kobo: r.budget_min_kobo,
    budget_max_kobo: r.budget_max_kobo,
    start_date: r.start_date,
    trial_days: r.trial_days,
    status: r.status,
    created_at: r.created_at,
    my_proposals: db.proposals.filter((p) => p.request_id === r.id && p.agency_id === agency.id).length,
  };
}

export function proposalOut(p: (typeof db.proposals)[number]) {
  const worker = db.workers.find((w) => w.id === p.worker_id)!;
  return {
    id: p.id,
    request_id: p.request_id,
    worker: { id: worker.id, full_name: worker.full_name, role: worker.role },
    note: p.note,
    status: p.status,
    created_at: p.created_at,
  };
}

export function placementOut(p: MockPlacement, viewerRole: Role, withDetail = true) {
  const worker = db.workers.find((w) => w.id === p.worker_id)!;
  const family = db.families.find((f) => f.id === p.family_id)!;
  const agency = db.agencies.find((a) => a.id === p.agency_id)!;
  const base = {
    id: p.id,
    status: p.status,
    worker: { id: worker.id, full_name: worker.full_name, role: worker.role },
    family: { id: family.id, name: family.name },
    agency: { id: agency.id, name: agency.name },
    request_id: p.request_id,
    hold_expires_at: p.hold_expires_at,
    trial_starts_on: p.trial_starts_on,
    trial_ends_on: p.trial_ends_on,
    confirmed_at: p.confirmed_at,
    ended_at: p.ended_at,
    end_reason: p.end_reason,
    replacements_used: p.replacements_used,
    created_at: p.created_at,
  };
  if (!withDetail) return base;
  return {
    ...base,
    allowed_actions: allowedActions(viewerRole, {
      status: p.status,
      confirmedAt: p.confirmed_at,
      replacementWindowDays: business.replacementWindowDays,
    }),
    events: db.placementEvents
      .filter((e) => e.placement_id === p.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ from: e.from_status, to: e.to_status, at: e.created_at, actor: e.actor, reason: e.reason })),
  };
}

export { activePlacementFor };
