import type { WorkerPublic } from "@/features/workers";
import type { PlacementStatus, ProposalStatus, RequestStatus, WorkerRole } from "@/types/domain";

/**
 * A family's request as an agency sees it. No family name or address before a placement:
 * agencies see the area, schedule and budget only.
 */
export type AgencyRequest = {
  id: string;
  role: WorkerRole;
  title: string;
  description: string;
  schedule: "full_time" | "part_time";
  live_in: boolean;
  /** Validated against the list of states when written; responses carry it as plain text. */
  state: string;
  lga: string;
  budget_min_kobo: number | null;
  budget_max_kobo: number | null;
  start_date: string;
  trial_days: number;
  status: RequestStatus;
  created_at: string;
  my_proposals: number;
};

/** A request as its family sees it. */
export type FamilyRequest = Omit<AgencyRequest, "my_proposals"> & {
  /** Proposals the family can act on or has acted on (withdrawn ones aren't shown). */
  proposals_count: number;
  pending_proposals: number;
  replaces_placement_id: string | null;
  /** Set once a proposal is accepted. */
  placement_id: string | null;
};

export type FamilyProposal = {
  id: string;
  request_id: string;
  worker: WorkerPublic;
  note: string | null;
  status: ProposalStatus;
  created_at: string;
};

export type AcceptResult = {
  /** `pending_payment` when a fee is due, `trial` when it isn't. */
  placement: { id: string; status: PlacementStatus };
  /** Null when no fee is due (a replacement covered by the free allowance). */
  payment: { authorization_url: string; reference: string } | null;
};

export type Proposal = {
  id: string;
  request_id: string;
  worker: { id: string; full_name: string; role: WorkerRole };
  note: string | null;
  status: ProposalStatus;
  created_at: string;
};
