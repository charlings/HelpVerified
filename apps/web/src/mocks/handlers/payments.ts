import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { db, persist } from "../db";
import { activePlacementFor, nowIso } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { applyHoldExpiry, transition } from "../placements-domain";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const DAY = 24 * 60 * 60 * 1000;

function placementStatusFor(placementId: string | null) {
  return placementId ? (db.placements.find((p) => p.id === placementId)?.status ?? null) : null;
}

export const paymentHandlers = [
  // The callback page asks the API, which re-verifies with Paystack before reporting success.
  http.get(`${base}/payments/:reference/verify`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");
    applyHoldExpiry();
    const payment = db.payments.find((p) => p.reference === params.reference && p.payer_user_id === user.id);
    if (!payment) return errorResponse("NOT_FOUND", "Payment not found.");
    return HttpResponse.json({
      reference: payment.reference,
      status: payment.status,
      amount_kobo: payment.amount_kobo,
      placement_id: payment.placement_id,
      placement_status: placementStatusFor(payment.placement_id),
    });
  }),

  // ---- Demo mode only: stand-ins for Paystack's hosted checkout and webhook. ----

  http.get(`${base}/__mock/paystack/transaction/:reference`, ({ params }) => {
    const payment = db.payments.find((p) => p.reference === params.reference);
    if (!payment) return errorResponse("NOT_FOUND", "Unknown transaction.");
    const payer = db.users.find((u) => u.id === payment.payer_user_id);
    return HttpResponse.json({
      reference: payment.reference,
      amount_kobo: payment.amount_kobo,
      email: payer?.email ?? "",
      status: payment.status,
    });
  }),

  /**
   * Simulates Paystack's `charge.success` webhook (database.md §7): processed once per event,
   * amount re-checked, then pending_payment → trial. If the hold expired and the worker has
   * since been placed elsewhere, the payment is marked for refund and no placement is created.
   */
  http.post(`${base}/__mock/paystack/charge`, async ({ request }) => {
    await mockLatency();
    const { reference } = (await request.json().catch(() => ({}))) as { reference?: string };
    const payment = db.payments.find((p) => p.reference === reference);
    if (!payment) return errorResponse("NOT_FOUND", "Unknown transaction.");

    const eventId = `charge.success:${payment.reference}`;
    if (db.webhookEvents.includes(eventId)) return HttpResponse.json({ status: payment.status }); // duplicate: no second effect
    db.webhookEvents.push(eventId);

    applyHoldExpiry();
    const placement = db.placements.find((p) => p.id === payment.placement_id);
    if (!placement || placement.status !== "pending_payment") {
      // Paid after the hold lapsed: never create a second active placement for the worker.
      const workerTaken = placement ? Boolean(activePlacementFor(placement.worker_id)) : true;
      payment.status = workerTaken || placement?.status === "cancelled" ? "refunded" : payment.status;
      persist();
      return HttpResponse.json({ status: payment.status });
    }

    payment.status = "success";
    payment.paid_at = nowIso();
    const req = db.requests.find((r) => r.id === placement.request_id)!;
    placement.hold_expires_at = null;
    placement.trial_starts_on = new Date().toISOString().slice(0, 10);
    placement.trial_ends_on = new Date(Date.now() + req.trial_days * DAY).toISOString().slice(0, 10);
    transition(placement, "trial", "system");
    persist();
    return HttpResponse.json({ status: payment.status });
  }),
];
