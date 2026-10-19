import type { BadgeTone } from "@/components/ui/Badge";
import type { AgencyStatus } from "@/types/domain";
import type { AgencyAction, AlertKind, AlertState, AuditAction } from "./types";

/** The one place agency statuses get their label, colour and meaning. */
export const agencyStatus: Record<AgencyStatus, { label: string; tone: BadgeTone; description: string }> = {
  pending: { label: "Awaiting approval", tone: "warning", description: "Applied and waiting for review." },
  approved: {
    label: "Approved",
    tone: "success",
    description: "Can list workers and propose them, with an active subscription.",
  },
  suspended: {
    label: "Suspended",
    tone: "danger",
    description: "Can't list or propose. Its workers are hidden from families; running placements continue.",
  },
  rejected: { label: "Rejected", tone: "neutral", description: "Application declined. This is final in this version." },
};

type ActionCopy = {
  label: string;
  /** Past tense, for the confirmation toast. */
  done: string;
  variant: "primary" | "secondary";
  title: (name: string) => string;
  description: string;
  /** Reject and suspend need a reason; the agency sees it. */
  needsReason: boolean;
};

export const agencyAction: Record<AgencyAction, ActionCopy> = {
  approve: {
    label: "Approve",
    done: "approved",
    variant: "primary",
    title: (name) => `Approve ${name}?`,
    description:
      "They can list workers who pass all four checks and propose them to families once their subscription is active.",
    needsReason: false,
  },
  reject: {
    label: "Reject",
    done: "rejected",
    variant: "secondary",
    title: (name) => `Reject ${name}?`,
    description: "Rejection is final in this version. The agency sees your reason and can contact us.",
    needsReason: true,
  },
  suspend: {
    label: "Suspend",
    done: "suspended",
    variant: "secondary",
    title: (name) => `Suspend ${name}?`,
    description:
      "Their listed workers are hidden from families and pending proposals are withdrawn. Placements already running continue. The agency sees your reason.",
    needsReason: true,
  },
  reinstate: {
    label: "Reinstate",
    done: "reinstated",
    variant: "primary",
    title: (name) => `Reinstate ${name}?`,
    description:
      "They can work again. Their workers stay delisted until the agency relists them, and all four checks still apply.",
    needsReason: false,
  },
};

export const auditAction: Record<AuditAction, string> = {
  "agency.approved": "Approved agency",
  "agency.rejected": "Rejected agency",
  "agency.suspended": "Suspended agency",
  "agency.reinstated": "Reinstated agency",
  "worker.check_flagged": "Flagged a check",
  "document.viewed": "Viewed a document",
  "placement.ended": "Ended placement",
  "worker.evidence_deleted": "Deleted old evidence",
  "alert.acknowledged": "Acknowledged an alert",
  "alert.resolved": "Resolved an alert",
};

// TODO(content): alert titles and guidance await owner wording (owner-inputs #7d).
/** What each payment alert means and what the admin should check. Refunds are made in the Paystack dashboard. */
export const alertKind: Record<AlertKind, { title: string; guidance: string }> = {
  checkout_unresolved: {
    title: "Checkout couldn't be resolved",
    guidance: "Paystack didn't confirm this checkout's outcome. Check the reference in the Paystack dashboard.",
  },
  unmatched_charge: {
    title: "Payment for an unknown reference",
    guidance: "Paystack reported a payment HelpVerified didn't start. Find the payer in the dashboard.",
  },
  refund_attention: {
    title: "Refund needs attention",
    guidance: "Paystack declined or failed the refund. Refund in the dashboard, then attach its refund ID.",
  },
  refund_stuck: {
    title: "Refund hasn't finished",
    guidance: "Paystack accepted the refund but hasn't processed it. Check its status in the dashboard.",
  },
  refund_admin_review: {
    title: "Refund needs manual review",
    guidance:
      "We couldn't confirm whether this refund reached Paystack, so it wasn't sent again. Check the dashboard before refunding.",
  },
  late_payment: {
    title: "Paid after the hold ended",
    guidance: "The family paid after the worker's hold expired. A full refund was started automatically.",
  },
  duplicate_charge: {
    title: "Placement paid twice",
    guidance: "One payment was applied; the other is being refunded automatically.",
  },
  settlement_failed: {
    title: "Payment couldn't be settled",
    guidance: "A confirmed payment couldn't be applied after several tries. Check the placement and payment.",
  },
  legacy_unresolved: {
    title: "Payment from before the upgrade",
    guidance: "This payment's earlier state didn't prove its outcome. Check it in the Paystack dashboard.",
  },
};

export const alertState: Record<AlertState, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "danger" },
  acknowledged: { label: "Acknowledged", tone: "warning" },
  resolved: { label: "Resolved", tone: "neutral" },
};
