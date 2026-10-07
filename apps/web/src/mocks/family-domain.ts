/** Family-side shapes and helpers for the mock (what a family may see). */
import { db, type MockFamily, type MockRequest, type MockUser, type MockWorker } from "./db";
import { activePlacementFor, itemsFor } from "./domain";

export function familyOf(user: MockUser): MockFamily | undefined {
  return db.families.find((f) => f.user_id === user.id);
}

/** `WorkerPublicOut`: first name, role, experience, languages, agency, verified checks with dates. Nothing else. */
export function workerPublicOut(worker: MockWorker) {
  const agency = db.agencies.find((a) => a.id === worker.agency_id)!;
  return {
    id: worker.id,
    first_name: worker.full_name.split(/\s+/)[0] ?? worker.full_name,
    role: worker.role,
    years_experience: worker.years_experience,
    languages: worker.languages,
    live_in_ok: worker.live_in_ok,
    agency: { id: agency.id, name: agency.name },
    badges: itemsFor(worker.id)
      .filter((i) => i.status === "verified" && i.verified_at)
      .map((i) => ({ kind: i.kind, verified_at: i.verified_at! })),
    available: !activePlacementFor(worker.id),
  };
}

export function requestOutForFamily(r: MockRequest) {
  const visible = db.proposals.filter((p) => p.request_id === r.id && p.status !== "withdrawn");
  const placement = db.placements
    .filter((p) => p.request_id === r.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
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
    proposals_count: visible.length,
    pending_proposals: visible.filter((p) => p.status === "pending").length,
    replaces_placement_id: r.replaces_placement_id,
    placement_id: placement?.id ?? null,
  };
}

export function proposalOutForFamily(p: (typeof db.proposals)[number]) {
  const worker = db.workers.find((w) => w.id === p.worker_id)!;
  return {
    id: p.id,
    request_id: p.request_id,
    worker: workerPublicOut(worker),
    note: p.note,
    status: p.status,
    created_at: p.created_at,
  };
}
