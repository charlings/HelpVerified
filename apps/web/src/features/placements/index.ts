// Shared API of the placements feature. Route files import screens from ./screens/* directly.
export { allowedActions, canTransition, transitions, type PlacementAction } from "./state-machine";
export { endReason, placementAction, placementStatus } from "./status";
export { placementKeys, placementsApi, type PlacementFilters } from "./api";
export type { Placement, PlacementEvent, PlacementSummary } from "./types";
