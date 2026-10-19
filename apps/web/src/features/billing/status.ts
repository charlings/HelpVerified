import type { BadgeTone } from "@/components/ui/Badge";
import type { PaymentStatus, SubscriptionStatus } from "@/types/domain";

export const subscriptionStatus: Record<SubscriptionStatus, { label: string; tone: BadgeTone; description: string }> = {
  active: { label: "Active", tone: "success", description: "Renews automatically" },
  non_renewing: { label: "Ending", tone: "warning", description: "Won't renew" },
  past_due: { label: "Payment overdue", tone: "danger", description: "Payment failed; update your card" },
  cancelled: { label: "Cancelled", tone: "neutral", description: "Ended" },
};

export const paymentStatus: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  success: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refund_pending: { label: "Refund in progress", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
};
