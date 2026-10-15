import type { FamilyRequest } from "@/features/requests";
import type { PlacementSummary } from "@/features/placements";
import { api } from "@/lib/api-client";

/** The area comes from the family's first request; the API types it as nullable. */
export type FamilyProfile = { id: string; name: string; state: string | null; lga: string | null };

export type FamilyDashboard = {
  active_placements: PlacementSummary[];
  open_requests: FamilyRequest[];
};

export const familyKeys = {
  dashboard: ["family", "dashboard"] as const,
  profile: ["family", "profile"] as const,
};

export const familiesApi = {
  dashboard: () => api.get<FamilyDashboard>("/families/me/dashboard"),
  /** Null until the family posts their first request. */
  profile: () => api.get<FamilyProfile | null>("/families/me"),
};
