import { api } from "@/lib/api-client";
import type { Paginated, PaymentStatus, RefundStatus, SubscriptionStatus } from "@/types/domain";

export type Subscription = {
  plan_name: string;
  plan_code: string;
  status: SubscriptionStatus;
  /** Null until Paystack reports the first billing period. */
  current_period_end: string | null;
};

export type Payment = {
  id: string;
  kind: "placement_fee" | "subscription";
  description: string;
  amount_kobo: number;
  currency: "NGN";
  reference: string;
  status: PaymentStatus;
  refund_status: RefundStatus;
  paid_at: string | null;
  created_at: string;
};

/** `GET /payments/{reference}/verify`: the API re-checks with Paystack before reporting success. */
export type PaymentCheck = { reference: string; status: PaymentStatus };

export const billingKeys = {
  subscription: ["billing", "subscription"] as const,
  payments: (page: number) => ["billing", "payments", page] as const,
  payment: (reference: string) => ["billing", "payment", reference] as const,
};

export const billingApi = {
  subscription: () => api.get<Subscription | null>("/billing/subscription"),
  payments: (page: number) => api.get<Paginated<Payment>>("/payments", { query: { page, page_size: 20 } }),
  /** Opens a Paystack checkout for the monthly plan; Paystack sends the agency back to this page. */
  startSubscription: () => api.post<{ authorization_url: string; reference: string }>("/billing/subscription"),
  verifyPayment: (reference: string) => api.get<PaymentCheck>(`/payments/${encodeURIComponent(reference)}/verify`),
};
