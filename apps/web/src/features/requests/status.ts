import type { BadgeTone } from "@/components/ui/Badge";
import type { ProposalStatus, RequestStatus } from "@/types/domain";

export const requestStatus: Record<RequestStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "info" },
  matched: { label: "Matched", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
};

export const proposalStatus: Record<ProposalStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for the family", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  superseded: { label: "Another worker was chosen", tone: "neutral" },
};

export const scheduleLabel = { full_time: "Full-time", part_time: "Part-time" } as const;
