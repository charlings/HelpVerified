import { api } from "@/lib/api-client";
import type { PaymentStatus, RefundStatus } from "@/types/domain";

export type PaymentVerification = {
  reference: string;
  status: PaymentStatus;
  refund_status: RefundStatus;
  amount_kobo: number;
  placement_id: string | null;
  placement_status: string | null;
};

/** Demo mode only: what the stand-in checkout shows. */
export type DemoTransaction = {
  reference: string;
  kind: "placement_fee" | "subscription";
  amount_kobo: number;
  email: string;
  status: PaymentStatus;
};

export const paymentsApi = {
  /** Called on the Paystack callback page; the API re-verifies with Paystack before reporting success. */
  verify: (reference: string) => api.get<PaymentVerification>(`/payments/${encodeURIComponent(reference)}/verify`),

  demoTransaction: (reference: string) =>
    api.get<DemoTransaction>(`/__mock/paystack/transaction/${encodeURIComponent(reference)}`, { skipAuthRetry: true }),
  /** Demo mode only: simulates Paystack's charge.success webhook. */
  demoCharge: (reference: string) =>
    api.post<{ status: PaymentStatus }>("/__mock/paystack/charge", { reference }, { skipAuthRetry: true }),
};
