import { http, HttpResponse } from "msw";
import { business } from "@/config/business";
import { env } from "@/config/env";
import { routes } from "@/config/routes";
import { createRequestSchema } from "@/features/requests";
import { db, DEMO_PLACEMENT_FEE_KOBO, persist, type MockPlacement, type MockUser } from "../db";
import { activePlacementFor, applyExpiry, nowIso, paginate } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { familyOf, proposalOutForFamily, requestOutForFamily, workerPublicOut } from "../family-domain";
import { mockLatency } from "../latency";
import { addEvent, applyHoldExpiry, placementOut } from "../placements-domain";
import { authenticate, fieldErrors } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const DAY = 24 * 60 * 60 * 1000;

function familyContext(request: Request): { user: MockUser } | { error: Response } {
  const user = authenticate(request);
  if (!user) return { error: errorResponse("UNAUTHENTICATED", "Not signed in.") };
  if (user.role !== "family") return { error: errorResponse("FORBIDDEN", "Families only.") };
  applyExpiry();
  applyHoldExpiry();
  return { user };
}

function ownRequest(user: MockUser, id: unknown) {
  const family = familyOf(user);
  return family ? db.requests.find((r) => r.id === id && r.family_id === family.id) : undefined;
}

function ownProposal(user: MockUser, id: unknown) {
  const proposal = db.proposals.find((p) => p.id === id);
  return proposal && ownRequest(user, proposal.request_id) ? proposal : undefined;
}

/** Family handlers for paths shared with agencies. They run first and pass through for other roles. */
export const familyRequestHandlers = [
  http.get(`${base}/requests`, async ({ request }) => {
    const user = authenticate(request);
    if (user?.role !== "family") return; // agency handler answers
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    applyHoldExpiry();
    const family = familyOf(user);
    const rows = db.requests
      .filter((r) => r.family_id === family?.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(requestOutForFamily);
    return HttpResponse.json(paginate(rows, new URL(request.url)));
  }),

  http.post(`${base}/requests`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = familyContext(request);
    if ("error" in ctx) return ctx.error;
    const { user } = ctx;
    if (!user.email_verified_at) return errorResponse("EMAIL_NOT_VERIFIED", "Verify your email first.");

    const parsed = createRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid request.", fieldErrors(parsed.error.issues));

    let family = familyOf(user);
    if (!family) {
      const surname = user.full_name.split(/\s+/).at(-1) ?? user.full_name;
      family = {
        id: `f-${crypto.randomUUID()}`,
        user_id: user.id,
        name: `${surname} family`,
        state: parsed.data.state,
        lga: parsed.data.lga,
      };
      db.families.push(family);
    }
    const created = {
      id: `r-${crypto.randomUUID()}`,
      family_id: family.id,
      ...parsed.data,
      status: "open" as const,
      replaces_placement_id: null,
      created_at: nowIso(),
    };
    db.requests.push(created);
    persist();
    return HttpResponse.json(requestOutForFamily(created), { status: 201 });
  }),

  http.get(`${base}/requests/:id`, async ({ request, params }) => {
    const user = authenticate(request);
    if (user?.role !== "family") return;
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    applyHoldExpiry();
    const found = ownRequest(user, params.id);
    return found ? HttpResponse.json(requestOutForFamily(found)) : errorResponse("NOT_FOUND", "Request not found.");
  }),

  http.get(`${base}/requests/:id/proposals`, async ({ request, params }) => {
    const user = authenticate(request);
    if (user?.role !== "family") return;
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    applyExpiry();
    applyHoldExpiry();
    const found = ownRequest(user, params.id);
    if (!found) return errorResponse("NOT_FOUND", "Request not found.");
    const rows = db.proposals
      .filter((p) => p.request_id === found.id && p.status !== "withdrawn")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(proposalOutForFamily);
    return HttpResponse.json(rows);
  }),

  http.post(`${base}/requests/:id/cancel`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = familyContext(request);
    if ("error" in ctx) return ctx.error;
    const found = ownRequest(ctx.user, params.id);
    if (!found) return errorResponse("NOT_FOUND", "Request not found.");
    if (found.status !== "open") return errorResponse("REQUEST_NOT_OPEN", "Only open requests can be cancelled.");
    found.status = "cancelled";
    for (const p of db.proposals) if (p.request_id === found.id && p.status === "pending") p.status = "declined";
    persist();
    return HttpResponse.json(requestOutForFamily(found));
  }),

  http.post(`${base}/proposals/:id/decline`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = familyContext(request);
    if ("error" in ctx) return ctx.error;
    const proposal = ownProposal(ctx.user, params.id);
    if (!proposal) return errorResponse("NOT_FOUND", "Proposal not found.");
    if (proposal.status !== "pending")
      return errorResponse("ILLEGAL_TRANSITION", "Only pending proposals can be declined.");
    proposal.status = "declined";
    persist();
    return HttpResponse.json(proposalOutForFamily(proposal));
  }),

  // Accept (database.md §7): lock proposal and worker, check, create the hold, supersede the rest.
  http.post(`${base}/proposals/:id/accept`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = familyContext(request);
    if ("error" in ctx) return ctx.error;
    const { user } = ctx;

    const key = request.headers.get("Idempotency-Key");
    const replay = key ? db.idempotency[`${user.id}:${key}`] : undefined;
    if (replay) return HttpResponse.json(replay.body as Record<string, unknown>, { status: replay.status });

    const proposal = ownProposal(user, params.id);
    if (!proposal) return errorResponse("NOT_FOUND", "Proposal not found.");
    const req = db.requests.find((r) => r.id === proposal.request_id)!;
    if (req.status !== "open") return errorResponse("REQUEST_NOT_OPEN", "This request is no longer open.");
    if (proposal.status !== "pending") return errorResponse("ILLEGAL_TRANSITION", "This proposal can't be accepted.");
    const worker = db.workers.find((w) => w.id === proposal.worker_id)!;
    if (worker.listing_status !== "listed") return errorResponse("WORKER_NOT_LISTED", "Worker isn't listed.");
    // One active placement per worker (partial unique index + row lock in the real API).
    if (activePlacementFor(worker.id)) return errorResponse("WORKER_UNAVAILABLE", "Worker was just placed.");

    const replaced = req.replaces_placement_id
      ? db.placements.find((p) => p.id === req.replaces_placement_id)
      : undefined;
    const feeWaived = Boolean(replaced && replaced.replacements_used <= business.freeReplacements);
    const now = Date.now();
    const placement: MockPlacement = {
      id: `p-${crypto.randomUUID()}`,
      request_id: req.id,
      proposal_id: proposal.id,
      worker_id: worker.id,
      family_id: req.family_id,
      agency_id: proposal.agency_id,
      status: feeWaived ? "trial" : "pending_payment",
      hold_expires_at: feeWaived ? null : new Date(now + business.paymentHoldMinutes * 60_000).toISOString(),
      trial_starts_on: feeWaived ? new Date(now).toISOString().slice(0, 10) : null,
      trial_ends_on: feeWaived ? new Date(now + req.trial_days * DAY).toISOString().slice(0, 10) : null,
      confirmed_at: null,
      ended_at: null,
      end_reason: null,
      replacements_used: replaced?.replacements_used ?? 0,
      created_at: nowIso(),
    };
    db.placements.push(placement);
    addEvent(placement, null, placement.status, "family", feeWaived ? "Replacement — no fee" : null);

    proposal.status = "accepted";
    for (const other of db.proposals) {
      if (other.request_id === req.id && other.id !== proposal.id && other.status === "pending")
        other.status = "superseded";
    }
    req.status = "matched";

    let payment: { authorization_url: string; reference: string } | null = null;
    if (!feeWaived) {
      const reference = `HV-PF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      db.payments.push({
        id: `pay-${crypto.randomUUID()}`,
        kind: "placement_fee",
        payer_user_id: user.id,
        placement_id: placement.id,
        agency_id: null,
        amount_kobo: DEMO_PLACEMENT_FEE_KOBO,
        reference,
        status: "pending",
        paid_at: null,
        created_at: nowIso(),
      });
      // Real API: Paystack's hosted checkout URL. Demo: the in-app stand-in.
      payment = { authorization_url: `${routes.demoCheckout}?reference=${reference}`, reference };
    }

    const body = { placement: placementOut(placement, "family", false), payment };
    if (key) db.idempotency[`${user.id}:${key}`] = { status: 201, body };
    persist();
    return HttpResponse.json(body, { status: 201 });
  }),

  http.get(`${base}/workers/:id/public`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = familyContext(request);
    if ("error" in ctx) return ctx.error;
    const family = familyOf(ctx.user);
    // Only families who received a proposal for this worker may see their profile.
    const received = db.proposals.some(
      (p) =>
        p.worker_id === params.id &&
        p.status !== "withdrawn" &&
        db.requests.some((r) => r.id === p.request_id && r.family_id === family?.id),
    );
    const worker = db.workers.find((w) => w.id === params.id);
    return worker && received
      ? HttpResponse.json(workerPublicOut(worker))
      : errorResponse("NOT_FOUND", "Worker not found.");
  }),
];
