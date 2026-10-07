import { api } from "@/lib/api-client";
import type { Paginated, PaymentStatus, SubscriptionStatus } from "@/types/domain";

export type Subscription = {
  plan_name: string;
  plan_code: string;
  status: SubscriptionStatus;
  current_period_end: string;
};

export type Payment = {
  id: string;
  kind: "placement_fee" | "subscription";
  description: string;
  amount_kobo: number;
  currency: "NGN";
  reference: string;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
};

export const billingKeys = {
  subscription: ["billing", "subscription"] as const,
  payments: (page: number) => ["billing", "payments", page] as const,
};

export const billingApi = {
  subscription: () => api.get<Subscription | null>("/billing/subscription"),
  payments: (page: number) => api.get<Paginated<Payment>>("/payments", { query: { page, page_size: 20 } }),
};
