import { http, HttpResponse } from "msw";
import { business } from "@/config/business";
import { env } from "@/config/env";
import { routes } from "@/config/routes";
import { db, persist, type MockPlacement, type MockUser } from "../db";
import { nowIso } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { familyOf, requestOutForFamily } from "../family-domain";
import { mockLatency } from "../latency";
import { applyHoldExpiry, placementOut, transition } from "../placements-domain";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const DAY = 24 * 60 * 60 * 1000;

type Resolved = { user: MockUser; placement: MockPlacement } | { error: Response };

/** A family's own placement (404 for anyone else's), after applying hold expiry. */
function resolve(request: Request, id: unknown): Resolved {
  const user = authenticate(request);
  if (!user) return { error: errorResponse("UNAUTHENTICATED", "Not signed in.") };
  if (user.role !== "family") return { error: errorResponse("FORBIDDEN", "Families only.") };
  applyHoldExpiry();
  const family = familyOf(user);
  const placement = db.placements.find((p) => p.id === id && p.family_id === family?.id);
  return placement ? { user, placement } : { error: errorResponse("NOT_FOUND", "Placement not found.") };
}

async function reasonFrom(request: Request): Promise<string | null> {
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
  return reason && reason.trim().length >= 5 ? reason.trim() : null;
}

const reasonRequired = (message: string) =>
  errorResponse("VALIDATION_ERROR", "Reason required.", { reason: [message] });

export const familyPlacementHandlers = [
  http.post(`${base}/placements/:id/confirm`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = resolve(request, params.id);
    if ("error" in r) return r.error;
    if (r.placement.status !== "trial")
      return errorResponse("ILLEGAL_TRANSITION", "Only a placement on trial can be confirmed.");
    r.placement.confirmed_at = nowIso();
    transition(r.placement, "confirmed", "family");
    persist();
    return HttpResponse.json(placementOut(r.placement, "family"));
  }),

  // Cancelling an unpaid hold: the worker is released and the request reopens.
  http.post(`${base}/placements/:id/cancel`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = resolve(request, params.id);
    if ("error" in r) return r.error;
    const reason = await reasonFrom(request);
    if (!reason) return reasonRequired("Say why you're cancelling.");
    if (r.placement.status !== "pending_payment") {
      return errorResponse("ILLEGAL_TRANSITION", "Only a placement awaiting payment can be cancelled.");
    }
    transition(r.placement, "cancelled", "family", { reason, endReason: "family_ended" });
    r.placement.hold_expires_at = null;
    const req = db.requests.find((x) => x.id === r.placement.request_id);
    if (req) req.status = "open";
    for (const p of db.proposals) {
      if (p.request_id === r.placement.request_id && (p.status === "superseded" || p.status === "accepted"))
        p.status = "pending";
    }
    for (const pay of db.payments)
      if (pay.placement_id === r.placement.id && pay.status === "pending") pay.status = "failed";
    persist();
    return HttpResponse.json(placementOut(r.placement, "family"));
  }),

  // Resume the checkout for an unpaid hold.
  http.post(`${base}/placements/:id/pay`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = resolve(request, params.id);
    if ("error" in r) return r.error;
    if (r.placement.status !== "pending_payment") return errorResponse("ILLEGAL_TRANSITION", "Nothing to pay.");
    const payment = db.payments.find((p) => p.placement_id === r.placement.id && p.status === "pending");
    if (!payment) return errorResponse("NOT_FOUND", "Payment not found.");
    return HttpResponse.json({
      authorization_url: `${routes.demoCheckout}?reference=${payment.reference}`,
      reference: payment.reference,
    });
  }),

  /**
   * Replacement (database.md §6): allowed during the trial, or within the window after confirming.
   * Ends this placement as `replaced`, opens a linked copy of the request, and counts the replacement.
   */
  http.post(`${base}/placements/:id/replacement`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = resolve(request, params.id);
    if ("error" in r) return r.error;
    const reason = await reasonFrom(request);
    if (!reason) return reasonRequired("Say what didn't work, so agencies can propose someone better suited.");
    const { placement, user } = r;

    if (placement.status === "confirmed") {
      const deadline = Date.parse(placement.confirmed_at!) + business.replacementWindowDays * DAY;
      if (Date.now() > deadline) return errorResponse("REPLACEMENT_WINDOW_CLOSED", "Replacement window closed.");
    } else if (placement.status !== "trial") {
      return errorResponse("ILLEGAL_TRANSITION", "This placement can't be replaced.");
    }

    transition(placement, "ended", "family", { reason, endReason: "replaced" });
    placement.replacements_used += 1;
    const original = db.requests.find((x) => x.id === placement.request_id)!;
    original.status = "closed";
    const newRequest = {
      ...original,
      id: `r-${crypto.randomUUID()}`,
      status: "open" as const,
      replaces_placement_id: placement.id,
      start_date: new Date().toISOString().slice(0, 10),
      created_at: nowIso(),
    };
    db.requests.push(newRequest);
    db.replacementRequests.push({
      id: `rr-${crypto.randomUUID()}`,
      placement_id: placement.id,
      requested_by: user.id,
      reason,
      status: "open",
      new_request_id: newRequest.id,
      created_at: nowIso(),
    });
    persist();
    return HttpResponse.json({
      placement: placementOut(placement, "family"),
      new_request: requestOutForFamily(newRequest),
    });
  }),

  http.get(`${base}/families/me`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    if (user.role !== "family") return errorResponse("FORBIDDEN", "Families only.");
    const family = familyOf(user);
    return HttpResponse.json(
      family ? { id: family.id, name: family.name, state: family.state, lga: family.lga } : null,
    );
  }),

  http.get(`${base}/families/me/dashboard`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    if (user.role !== "family") return errorResponse("FORBIDDEN", "Families only.");
    applyHoldExpiry();
    const family = familyOf(user);
    const placements = db.placements.filter((p) => p.family_id === family?.id);
    const active = placements
      .filter((p) => p.status === "pending_payment" || p.status === "trial" || p.status === "confirmed")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => placementOut(p, "family", false));
    const openRequests = db.requests
      .filter((x) => x.family_id === family?.id && x.status === "open")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(requestOutForFamily);
    return HttpResponse.json({ active_placements: active, open_requests: openRequests });
  }),
];
