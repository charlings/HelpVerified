/**
 * Placement transitions (database.md §6). Mirror of apps/api/app/modules/placements/state_machine.py.
 *
 * Only the mock API uses `allowedActions` (standing in for the server). Screens never compute what a
 * user may do; they render the `allowed_actions` the API returns, labelled via status.ts.
 */
import type { Role } from "@/config/routes";
import type { PlacementStatus } from "@/types/domain";

export type PlacementAction = "pay" | "cancel" | "confirm" | "request_replacement" | "end";

export const transitions: Record<PlacementStatus, readonly PlacementStatus[]> = {
  pending_payment: ["trial", "cancelled"],
  trial: ["confirmed", "ended"],
  confirmed: ["ended"],
  ended: [],
  cancelled: [],
};

export function canTransition(from: PlacementStatus, to: PlacementStatus): boolean {
  return transitions[from].includes(to);
}

type Context = {
  status: PlacementStatus;
  /** ISO timestamp the placement was confirmed, if it was. */
  confirmedAt: string | null;
  replacementWindowDays: number;
  now?: number;
};

const DAY = 24 * 60 * 60 * 1000;

export function allowedActions(role: Role, ctx: Context): PlacementAction[] {
  const now = ctx.now ?? Date.now();
  const inReplacementWindow =
    ctx.status === "trial" ||
    (ctx.status === "confirmed" &&
      ctx.confirmedAt !== null &&
      now <= Date.parse(ctx.confirmedAt) + ctx.replacementWindowDays * DAY);

  switch (role) {
    case "family":
      if (ctx.status === "pending_payment") return ["pay", "cancel"];
      if (ctx.status === "trial") return ["confirm", "request_replacement", "end"];
      if (ctx.status === "confirmed") return inReplacementWindow ? ["request_replacement", "end"] : ["end"];
      return [];
    case "agency_admin":
    case "super_admin":
      return ctx.status === "trial" || ctx.status === "confirmed" ? ["end"] : [];
  }
}
