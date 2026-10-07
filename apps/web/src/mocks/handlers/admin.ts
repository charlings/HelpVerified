import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import type { AgencyAction } from "@/features/admin";
import type { AgencyStatus } from "@/types/domain";
import {
  agencyDetailOut,
  agencySummaryOut,
  agencyTransitions,
  applyAgencyStatusEffects,
  auditOut,
  reasonRequired,
  requireAdmin,
  writeAudit,
} from "../admin-domain";
import { db, persist, type MockWorker } from "../db";
import {
  ACTIVE_PLACEMENT_STATUSES,
  applyExpiry,
  delistIfListed,
  itemOut,
  itemsFor,
  nowIso,
  paginate,
  workerOut,
} from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { applyHoldExpiry } from "../placements-domain";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const DAY = 24 * 60 * 60 * 1000;
const AGENCY_STATUSES: readonly AgencyStatus[] = ["pending", "approved", "suspended", "rejected"];

/** The agency's worker view plus which agency it belongs to; admins see every agency. */
function adminWorkerOut(worker: MockWorker) {
  const agency = db.agencies.find((a) => a.id === worker.agency_id);
  return { ...workerOut(worker), agency: { id: worker.agency_id, name: agency?.name ?? "Unknown agency" } };
}

/** Pending first (they need action), then newest. */
const statusOrder: Record<AgencyStatus, number> = { pending: 0, approved: 1, suspended: 2, rejected: 3 };

export const adminHandlers = [
  http.get(`${base}/admin/overview`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    applyExpiry();
    applyHoldExpiry();

    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const soon = now.getTime() + 3 * DAY;
    const pending = db.agencies
      .filter((a) => a.status === "pending")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    return HttpResponse.json({
      agencies_pending: pending.length,
      workers_listed: db.workers.filter((w) => w.listing_status === "listed").length,
      placements_active: db.placements.filter((p) =>
        (ACTIVE_PLACEMENT_STATUSES as readonly string[]).includes(p.status),
      ).length,
      trials_ending_soon: db.placements.filter(
        (p) => p.status === "trial" && p.trial_ends_on && Date.parse(p.trial_ends_on) <= soon,
      ).length,
      fees_paid_this_month_kobo: db.payments
        .filter(
          (p) =>
            p.kind === "placement_fee" && p.status === "success" && p.paid_at && Date.parse(p.paid_at) >= monthStart,
        )
        .reduce((sum, p) => sum + p.amount_kobo, 0),
      pending_agencies: pending.map(agencySummaryOut),
      recent_audit: db.auditLog.slice(0, 5).map(auditOut),
    });
  }),

  http.get(`${base}/admin/agencies`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const rows = db.agencies
      .filter((a) => !status || !AGENCY_STATUSES.includes(status as AgencyStatus) || a.status === status)
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.created_at.localeCompare(a.created_at))
      .map(agencySummaryOut);
    return HttpResponse.json(paginate(rows, url));
  }),

  http.get(`${base}/admin/agencies/:id`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    const agency = db.agencies.find((a) => a.id === params.id);
    if (!agency) return errorResponse("NOT_FOUND", "Agency not found.");
    return HttpResponse.json(agencyDetailOut(agency));
  }),

  http.get(`${base}/admin/workers`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    applyExpiry();
    const url = new URL(request.url);
    const agencyId = url.searchParams.get("agency_id");
    const role = url.searchParams.get("role");
    const listing = url.searchParams.get("listing_status");
    const rows = db.workers
      .filter((w) => !agencyId || w.agency_id === agencyId)
      .filter((w) => !role || w.role === role)
      .filter((w) => !listing || w.listing_status === listing)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map(adminWorkerOut);
    return HttpResponse.json(paginate(rows, url));
  }),

  http.get(`${base}/admin/workers/:id`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    applyExpiry();
    const worker = db.workers.find((w) => w.id === params.id);
    if (!worker) return errorResponse("NOT_FOUND", "Worker not found.");
    return HttpResponse.json({ ...adminWorkerOut(worker), checks: itemsFor(worker.id).map(itemOut) });
  }),

  /**
   * Flag (plan M7, decision 3): a verified check goes back to `submitted` with the reason, which delists
   * the worker (listing gate). An active placement is not ended.
   */
  http.post(`${base}/admin/workers/:id/flag`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    applyExpiry();
    const worker = db.workers.find((w) => w.id === params.id);
    if (!worker) return errorResponse("NOT_FOUND", "Worker not found.");
    const { kind, reason } = (await request.json().catch(() => ({}))) as { kind?: string; reason?: string };
    const item = itemsFor(worker.id).find((i) => i.kind === kind);
    if (!item) return errorResponse("VALIDATION_ERROR", "Unknown check.", { kind: ["Choose a check."] });
    const trimmed = reason?.trim() ?? "";
    if (trimmed.length < 5) {
      return errorResponse("VALIDATION_ERROR", "Reason required.", {
        reason: ["Say what needs re-checking. The agency will see it."],
      });
    }
    if (item.status !== "verified") return errorResponse("ILLEGAL_TRANSITION", "Only verified checks can be flagged.");

    item.status = "submitted";
    item.verified_at = null;
    item.verified_by = null;
    item.flag_reason = trimmed;
    item.flagged_at = nowIso();
    delistIfListed(worker.id);
    writeAudit(r.admin, "worker.check_flagged", "worker", worker.id, {
      label: worker.full_name,
      kind: item.kind,
      reason: trimmed,
    });
    persist();
    return HttpResponse.json({ ...adminWorkerOut(worker), checks: itemsFor(worker.id).map(itemOut) });
  }),

  http.get(`${base}/admin/audit-log`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const rows = db.auditLog.filter((e) => !action || e.action === action).map(auditOut);
    return HttpResponse.json(paginate(rows, url));
  }),

  http.post(`${base}/admin/agencies/:id/:action`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const r = requireAdmin(authenticate(request));
    if ("error" in r) return r.error;
    const action = params.action as AgencyAction;
    const move = agencyTransitions[action];
    if (!move) return errorResponse("NOT_FOUND", "Unknown action.");
    const agency = db.agencies.find((a) => a.id === params.id);
    if (!agency) return errorResponse("NOT_FOUND", "Agency not found.");

    const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
    const trimmed = reason?.trim() ?? "";
    if (reasonRequired.includes(action) && trimmed.length < 5) {
      return errorResponse("VALIDATION_ERROR", "Reason required.", {
        reason: ["Give a reason. The agency will see it."],
      });
    }
    // Someone else may have acted first: the move must still be legal from the current status.
    if (!move.from.includes(agency.status)) {
      return errorResponse("ILLEGAL_TRANSITION", `This agency is ${agency.status}.`);
    }

    agency.status = move.to;
    if (action === "approve" || action === "reinstate") {
      agency.approved_at ??= nowIso();
      agency.status_reason = null;
    } else {
      agency.status_reason = trimmed;
    }
    applyAgencyStatusEffects(agency, action);
    writeAudit(r.admin, move.audit, "agency", agency.id, {
      label: agency.name,
      ...(trimmed ? { reason: trimmed } : {}),
    });
    persist();
    return HttpResponse.json(agencyDetailOut(agency));
  }),
];
