import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { writeAudit } from "../admin-domain";
import type { MockPlacement, MockUser } from "../db";
import { db, persist } from "../db";
import { agencyOf, paginate } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { applyHoldExpiry, placementOut, transition } from "../placements-domain";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;

/** Parties to a placement and super admins can see it; anyone else gets 404. */
function visible(user: MockUser, p: MockPlacement): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "agency_admin") return agencyOf(user)?.id === p.agency_id;
  return db.families.find((f) => f.id === p.family_id)?.user_id === user.id;
}

export const placementHandlers = [
  http.get(`${base}/placements`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    applyHoldExpiry();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const rows = db.placements
      .filter((p) => visible(user, p))
      .filter((p) => !status || p.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => placementOut(p, user.role, false));
    return HttpResponse.json(paginate(rows, url));
  }),

  http.get(`${base}/placements/:id`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    applyHoldExpiry();
    const placement = db.placements.find((p) => p.id === params.id);
    if (!placement || !visible(user, placement)) return errorResponse("NOT_FOUND", "Placement not found.");
    return HttpResponse.json(placementOut(placement, user.role));
  }),

  http.post(`${base}/placements/:id/end`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    applyHoldExpiry();
    const placement = db.placements.find((p) => p.id === params.id);
    if (!placement || !visible(user, placement)) return errorResponse("NOT_FOUND", "Placement not found.");

    const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
    if (!reason || reason.trim().length < 5) {
      return errorResponse("VALIDATION_ERROR", "Reason required.", { reason: ["Say why the placement is ending."] });
    }
    if (placement.status !== "trial" && placement.status !== "confirmed") {
      return errorResponse("ILLEGAL_TRANSITION", "This placement can't be ended now.");
    }
    const actor = user.role === "family" ? "family" : user.role === "agency_admin" ? "agency" : "admin";
    const endReason =
      user.role === "family" ? "family_ended" : user.role === "agency_admin" ? "agency_ended" : "admin_ended";
    transition(placement, "ended", actor, { reason: reason.trim(), endReason });
    const req = db.requests.find((r) => r.id === placement.request_id);
    if (req) req.status = "closed";
    if (user.role === "super_admin") {
      const worker = db.workers.find((w) => w.id === placement.worker_id);
      const family = db.families.find((f) => f.id === placement.family_id);
      writeAudit(user, "placement.ended", "placement", placement.id, {
        label: `${worker?.full_name ?? "Worker"} with the ${family?.name ?? "family"}`,
        reason: reason.trim(),
      });
    }
    persist();
    return HttpResponse.json(placementOut(placement, user.role));
  }),
];
