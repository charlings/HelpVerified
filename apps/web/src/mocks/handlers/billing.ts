import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { routes } from "@/config/routes";
import { db, persist } from "../db";
import { agencyOf, nowIso, paginate, refundStatusOf, requireAgency, subscriptionOf } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { DEMO_SUBSCRIPTION_KOBO } from "../seed";
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

  // Mirrors PaymentService.start_subscription: approved agencies only, not while one is active.
  http.post(`${base}/billing/subscription`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    const ctx = requireAgency(user);
    if ("error" in ctx) return ctx.error;
    if (ctx.agency.status !== "approved") {
      return errorResponse("AGENCY_NOT_ACTIVE", "Your agency must be approved before it can subscribe.");
    }
    if (subscriptionOf(ctx.agency.id)?.status === "active") {
      return errorResponse("ILLEGAL_TRANSITION", "Your subscription is already active.");
    }
    const reference = `HV-SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    db.payments.push({
      id: `pay-${crypto.randomUUID()}`,
      kind: "subscription",
      payer_user_id: user!.id,
      placement_id: null,
      agency_id: ctx.agency.id,
      amount_kobo: DEMO_SUBSCRIPTION_KOBO,
      reference,
      status: "pending",
      paid_at: null,
      created_at: nowIso(),
    });
    persist();
    // Real API: Paystack's hosted checkout URL. Demo: the in-app stand-in.
    return HttpResponse.json({ authorization_url: `${routes.demoCheckout}?reference=${reference}`, reference });
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
        refund_status: refundStatusOf(p.status),
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
