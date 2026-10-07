import type { BadgeTone } from "@/components/ui/Badge";
import type { PlacementEndReason, PlacementStatus } from "@/types/domain";
import type { PlacementAction } from "./state-machine";

/** The one place placement statuses get their label and colour (design-system §4). */
export const placementStatus: Record<PlacementStatus, { label: string; tone: BadgeTone; description: string }> = {
  pending_payment: {
    label: "Awaiting payment",
    tone: "warning",
    description: "The family is paying the placement fee. The worker is held for them until then.",
  },
  trial: { label: "Trial", tone: "info", description: "The trial is under way." },
  confirmed: {
    label: "Confirmed",
    tone: "success",
    description: "The family confirmed the placement after the trial.",
  },
  ended: { label: "Ended", tone: "neutral", description: "This placement has ended." },
  cancelled: { label: "Cancelled", tone: "neutral", description: "This placement didn't go ahead." },
};

export const endReason: Record<PlacementEndReason, string> = {
  completed: "Completed",
  replaced: "Replacement requested",
  family_ended: "Ended by the family",
  agency_ended: "Ended by the agency",
  admin_ended: "Ended by HelpVerified",
  worker_left: "The worker left",
  payment_expired: "Payment wasn't completed in time",
};

/** How each action the API allows is presented. Screens render only actions present in `allowed_actions`. */
export const placementAction: Record<
  PlacementAction,
  { label: string; variant: "primary" | "secondary"; confirmTitle?: string; confirmText?: string }
> = {
  pay: { label: "Pay placement fee", variant: "primary" },
  cancel: { label: "Cancel", variant: "secondary", confirmTitle: "Cancel this placement?" },
  confirm: { label: "Confirm placement", variant: "primary", confirmTitle: "Confirm this placement?" },
  request_replacement: { label: "Request a replacement", variant: "secondary" },
  end: {
    label: "End placement",
    variant: "secondary",
    confirmTitle: "End this placement?",
    confirmText: "The worker becomes available for other families. This can't be undone.",
  },
};

export const eventActor: Record<"family" | "agency" | "admin" | "system", string> = {
  family: "Family",
  agency: "Agency",
  admin: "HelpVerified",
  system: "Automatic",
};
