import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { db, persist } from "../db";
import { activePlacementFor, applyExpiry, isAgencyActive, nowIso, ownWorker, paginate, requireAgency } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { applyHoldExpiry, proposalOut, requestOutForAgency, requestVisibleTo } from "../placements-domain";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;

function agencyContext(request: Request) {
  const ctx = requireAgency(authenticate(request));
  if ("error" in ctx) return ctx;
  applyExpiry();
  applyHoldExpiry();
  return ctx;
}

export const requestHandlers = [
  http.get(`${base}/requests`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = agencyContext(request);
    if ("error" in ctx) return ctx.error;
    const { agency } = ctx;
    const rows = db.requests
      .filter((r) => r.status === "open" && agency.roles_offered.includes(r.role) && r.state === agency.state)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => requestOutForAgency(agency, r));
    return HttpResponse.json(paginate(rows, new URL(request.url)));
  }),

  http.get(`${base}/requests/:id`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = agencyContext(request);
    if ("error" in ctx) return ctx.error;
    const found = db.requests.find((r) => r.id === params.id);
    if (!found || !requestVisibleTo(ctx.agency, found)) return errorResponse("NOT_FOUND", "Request not found.");
    return HttpResponse.json(requestOutForAgency(ctx.agency, found));
  }),

  http.get(`${base}/requests/:id/proposals`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = agencyContext(request);
    if ("error" in ctx) return ctx.error;
    const found = db.requests.find((r) => r.id === params.id);
    if (!found || !requestVisibleTo(ctx.agency, found)) return errorResponse("NOT_FOUND", "Request not found.");
    // Agencies see only their own proposals, never competitors'.
    const rows = db.proposals
      .filter((p) => p.request_id === found.id && p.agency_id === ctx.agency.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(proposalOut);
    return HttpResponse.json(rows);
  }),

  http.post(`${base}/requests/:id/proposals`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = agencyContext(request);
    if ("error" in ctx) return ctx.error;
    const { agency } = ctx;
    const found = db.requests.find((r) => r.id === params.id);
    if (!found || !requestVisibleTo(agency, found)) return errorResponse("NOT_FOUND", "Request not found.");
    if (!isAgencyActive(agency)) return errorResponse("AGENCY_NOT_ACTIVE", "Agency not active.");
    if (found.status !== "open") return errorResponse("REQUEST_NOT_OPEN", "Request not open.");

    const body = (await request.json().catch(() => ({}))) as { worker_id?: string; note?: string | null };
    const worker = ownWorker(agency, body.worker_id);
    if (!worker) {
      return errorResponse("VALIDATION_ERROR", "Unknown worker.", { worker_id: ["Choose one of your workers."] });
    }
    if (worker.role !== found.role) {
      return errorResponse("VALIDATION_ERROR", "Wrong role.", {
        worker_id: [`This request is for a ${found.role}.`],
      });
    }
    if (worker.listing_status !== "listed") return errorResponse("WORKER_NOT_LISTED", "Worker isn't listed.");
    // One active placement per worker (database.md §5): a placed worker can't be offered to another family.
    if (activePlacementFor(worker.id)) return errorResponse("WORKER_UNAVAILABLE", "Worker is in a placement.");
    const note = body.note?.trim() ? body.note.trim().slice(0, 500) : null;

    const existing = db.proposals.find((p) => p.request_id === found.id && p.worker_id === worker.id);
    if (existing && existing.status !== "withdrawn") return errorResponse("ALREADY_PROPOSED", "Already proposed.");
    if (existing) {
      existing.status = "pending";
      existing.note = note;
      existing.created_at = nowIso();
      persist();
      return HttpResponse.json(proposalOut(existing), { status: 201 });
    }
    const created = {
      id: `pr-${crypto.randomUUID()}`,
      request_id: found.id,
      worker_id: worker.id,
      agency_id: agency.id,
      note,
      status: "pending" as const,
      created_at: nowIso(),
    };
    db.proposals.push(created);
    persist();
    return HttpResponse.json(proposalOut(created), { status: 201 });
  }),

  http.post(`${base}/proposals/:id/withdraw`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = agencyContext(request);
    if ("error" in ctx) return ctx.error;
    const proposal = db.proposals.find((p) => p.id === params.id && p.agency_id === ctx.agency.id);
    if (!proposal) return errorResponse("NOT_FOUND", "Proposal not found.");
    if (proposal.status !== "pending")
      return errorResponse("ILLEGAL_TRANSITION", "Only pending proposals can be withdrawn.");
    proposal.status = "withdrawn";
    persist();
    return HttpResponse.json(proposalOut(proposal));
  }),
];
