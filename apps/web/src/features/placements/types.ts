import type { PlacementEndReason, PlacementStatus, WorkerRole } from "@/types/domain";
import type { PlacementAction } from "./state-machine";

export type PlacementEvent = {
  from: PlacementStatus | null;
  to: PlacementStatus;
  at: string;
  actor: "family" | "agency" | "admin" | "system";
  reason: string | null;
};

/** `PlacementOut` (api-contracts.md §4). */
export type Placement = {
  id: string;
  status: PlacementStatus;
  worker: { id: string; full_name: string; role: WorkerRole };
  family: { id: string; name: string };
  agency: { id: string; name: string };
  request_id: string;
  hold_expires_at: string | null;
  trial_starts_on: string | null;
  trial_ends_on: string | null;
  confirmed_at: string | null;
  ended_at: string | null;
  end_reason: PlacementEndReason | null;
  replacements_used: number;
  allowed_actions: PlacementAction[];
  events: PlacementEvent[];
  created_at: string;
};

export type PlacementSummary = Omit<Placement, "events" | "allowed_actions">;
