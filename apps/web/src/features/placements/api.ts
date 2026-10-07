import { api } from "@/lib/api-client";
import type { Paginated, PlacementStatus } from "@/types/domain";
import type { Placement, PlacementSummary } from "./types";

export type PlacementFilters = { status?: PlacementStatus; page?: number };

export const placementKeys = {
  all: ["placements"] as const,
  list: (filters: PlacementFilters) => [...placementKeys.all, "list", filters] as const,
  detail: (id: string) => [...placementKeys.all, "detail", id] as const,
};

export const placementsApi = {
  list: (filters: PlacementFilters) =>
    api.get<Paginated<PlacementSummary>>("/placements", { query: { ...filters, page_size: 20 } }),
  get: (id: string) => api.get<Placement>(`/placements/${id}`),
  end: (id: string, reason: string) => api.post<Placement>(`/placements/${id}/end`, { reason }),
  confirm: (id: string) =>
    api.post<Placement>(`/placements/${id}/confirm`, undefined, { idempotencyKey: `confirm-${id}` }),
  cancel: (id: string, reason: string) => api.post<Placement>(`/placements/${id}/cancel`, { reason }),
  /** Resumes the checkout for an unpaid hold. */
  pay: (id: string) => api.post<{ authorization_url: string; reference: string }>(`/placements/${id}/pay`),
  requestReplacement: (id: string, reason: string) =>
    api.post<{ placement: Placement; new_request: { id: string } }>(`/placements/${id}/replacement`, { reason }),
};
