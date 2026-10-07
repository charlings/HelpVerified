import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { db } from "../db";
import { applyExpiry, isAgencyActive, requireAgency, subscriptionOf } from "../domain";
import { forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const DAY = 24 * 60 * 60 * 1000;
const TRIAL_REMINDER_DAYS = 3;

export const agencyDashboardHandlers = [
  http.get(`${base}/agencies/me/dashboard`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    applyExpiry();
    const { agency } = ctx;

    const workers = db.workers.filter((w) => w.agency_id === agency.id);
    const count = (status: string) => workers.filter((w) => w.listing_status === status).length;
    const workerIds = new Set(workers.map((w) => w.id));
    const needsAttention = db.verificationItems.filter(
      (i) =>
        workerIds.has(i.worker_id) && (i.status === "rejected" || i.status === "expired" || i.status === "submitted"),
    ).length;

    const openRequests = db.requests.filter(
      (r) => r.status === "open" && agency.roles_offered.includes(r.role) && r.state === agency.state,
    ).length;

    const soon = Date.now() + TRIAL_REMINDER_DAYS * DAY;
    const trialsEnding = db.placements
      .filter((p) => p.agency_id === agency.id && p.status === "trial" && p.trial_ends_on)
      .filter((p) => Date.parse(p.trial_ends_on!) <= soon)
      .map((p) => ({
        id: p.id,
        worker_name: db.workers.find((w) => w.id === p.worker_id)?.full_name ?? "",
        family_name: db.families.find((f) => f.id === p.family_id)?.name ?? "",
        trial_ends_on: p.trial_ends_on!,
      }));

    const subscription = subscriptionOf(agency.id);
    return HttpResponse.json({
      agency: { id: agency.id, name: agency.name, status: agency.status, status_reason: agency.status_reason },
      subscription: subscription
        ? { status: subscription.status, current_period_end: subscription.current_period_end }
        : null,
      active: isAgencyActive(agency),
      workers: {
        total: workers.length,
        draft: count("draft"),
        listed: count("listed"),
        delisted: count("delisted"),
        suspended: count("suspended"),
      },
      checks_needing_attention: needsAttention,
      open_requests: openRequests,
      trials_ending: trialsEnding,
    });
  }),
];
