import { api } from "@/lib/api-client";
import type { Paginated } from "@/types/domain";
import type { CreateRequestPayload } from "./schemas";
import type { AcceptResult, FamilyProposal, FamilyRequest } from "./types";

export const familyRequestKeys = {
  all: ["family-requests"] as const,
  list: (page: number) => [...familyRequestKeys.all, "list", page] as const,
  detail: (id: string) => [...familyRequestKeys.all, "detail", id] as const,
  proposals: (id: string) => [...familyRequestKeys.all, "proposals", id] as const,
};

export const familyRequestsApi = {
  list: (page: number) => api.get<Paginated<FamilyRequest>>("/requests", { query: { page, page_size: 20 } }),
  get: (id: string) => api.get<FamilyRequest>(`/requests/${id}`),
  create: (payload: CreateRequestPayload) => api.post<FamilyRequest>("/requests", payload),
  cancel: (id: string) => api.post<FamilyRequest>(`/requests/${id}/cancel`),
  proposals: (id: string) => api.get<FamilyProposal[]>(`/requests/${id}/proposals`),
  decline: (proposalId: string) => api.post<FamilyProposal>(`/proposals/${proposalId}/decline`),
  /** Retried safely: the same key never creates two placements. */
  accept: (proposalId: string) =>
    api.post<AcceptResult>(`/proposals/${proposalId}/accept`, undefined, { idempotencyKey: `accept-${proposalId}` }),
};
