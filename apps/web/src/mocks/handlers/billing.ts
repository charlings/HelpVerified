import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { db } from "../db";
import { agencyOf, paginate, requireAgency, subscriptionOf } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;

export const billingHandlers = [
  http.get(`${base}/billing/subscription`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    const sub = subscriptionOf(ctx.agency.id);
    return HttpResponse.json(
      sub
        ? {
            plan_name: "Agency monthly",
            plan_code: sub.plan_code,
            status: sub.status,
            current_period_end: sub.current_period_end,
          }
        : null,
    );
  }),

  http.get(`${base}/payments`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    const agencyId = agencyOf(user)?.id;
    const rows = db.payments
      .filter((p) => p.payer_user_id === user.id || (agencyId !== undefined && p.agency_id === agencyId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        description: p.kind === "subscription" ? "Agency subscription" : "Placement fee",
        amount_kobo: p.amount_kobo,
        currency: "NGN",
        reference: p.reference,
        status: p.status,
        paid_at: p.paid_at,
        created_at: p.created_at,
      }));
    return HttpResponse.json(paginate(rows, new URL(request.url)));
  }),

  http.get(`${base}/agencies/me`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    const a = ctx.agency;
    return HttpResponse.json({
      id: a.id,
      name: a.name,
      cac_number: a.cac_number,
      email: a.email,
      phone: a.phone,
      address_line: a.address_line,
      state: a.state,
      lga: a.lga,
      roles_offered: a.roles_offered,
      status: a.status,
      created_at: a.created_at,
    });
  }),
];
