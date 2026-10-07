import { api } from "@/lib/api-client";
import type { Paginated } from "@/types/domain";
import type { CreateWorkerPayload } from "./schemas";
import type { Worker, WorkerFilters, WorkerPublic } from "./types";

export const workerKeys = {
  all: ["workers"] as const,
  list: (filters: WorkerFilters) => [...workerKeys.all, "list", filters] as const,
  detail: (id: string) => [...workerKeys.all, "detail", id] as const,
  public: (id: string) => [...workerKeys.all, "public", id] as const,
};

export const workersApi = {
  list: (filters: WorkerFilters, pageSize = 20) =>
    api.get<Paginated<Worker>>("/workers", { query: { ...filters, page_size: pageSize } }),
  get: (id: string) => api.get<Worker>(`/workers/${id}`),
  create: (payload: CreateWorkerPayload) => api.post<Worker>("/workers", payload),
  listWorker: (id: string) => api.post<Worker>(`/workers/${id}/list`),
  delistWorker: (id: string) => api.post<Worker>(`/workers/${id}/delist`),
  getPublic: (id: string) => api.get<WorkerPublic>(`/workers/${id}/public`),
};
