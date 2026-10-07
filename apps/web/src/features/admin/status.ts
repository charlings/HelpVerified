import type { BadgeTone } from "@/components/ui/Badge";
import type { AgencyStatus } from "@/types/domain";
import type { AgencyAction, AuditAction } from "./types";

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
};
