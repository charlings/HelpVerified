import { api } from "@/lib/api-client";
import type { Paginated } from "@/types/domain";
import type { AgencyRequest, Proposal } from "./types";

export const requestKeys = {
  all: ["requests"] as const,
  list: (page: number) => [...requestKeys.all, "list", page] as const,
  detail: (id: string) => [...requestKeys.all, "detail", id] as const,
  proposals: (id: string) => [...requestKeys.all, "proposals", id] as const,
};

export const requestsApi = {
  list: (page: number) => api.get<Paginated<AgencyRequest>>("/requests", { query: { page, page_size: 20 } }),
  get: (id: string) => api.get<AgencyRequest>(`/requests/${id}`),
  proposals: (id: string) => api.get<Proposal[]>(`/requests/${id}/proposals`),
  propose: (requestId: string, workerId: string, note: string) =>
    api.post<Proposal>(`/requests/${requestId}/proposals`, { worker_id: workerId, note: note || null }),
  withdraw: (proposalId: string) => api.post<Proposal>(`/proposals/${proposalId}/withdraw`),
};
