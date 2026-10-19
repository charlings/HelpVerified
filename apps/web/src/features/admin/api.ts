import { api } from "@/lib/api-client";
import type { AgencyStatus, ListingStatus, Paginated, VerificationKind, WorkerRole } from "@/types/domain";
import type {
  AdminAgency,
  AdminAgencySummary,
  AdminAlert,
  AlertFilter,
  AdminOverview,
  AdminWorker,
  AdminWorkerDetail,
  AgencyAction,
  AuditAction,
  AuditEntry,
} from "./types";

export type AgencyFilter = AgencyStatus | "all";
export type AdminWorkerFilters = {
  agency_id?: string;
  role?: WorkerRole;
  listing_status?: ListingStatus;
  page: number;
};

export const adminKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  agencies: (status: AgencyFilter, page: number) => ["admin", "agencies", status, page] as const,
  agency: (id: string) => ["admin", "agency", id] as const,
  workers: (filters: AdminWorkerFilters) => ["admin", "workers", filters] as const,
  worker: (id: string) => ["admin", "worker", id] as const,
  audit: (action: AuditAction | undefined, page: number) => ["admin", "audit", action ?? "all", page] as const,
  alerts: (state: AlertFilter, page: number) => ["admin", "alerts", state, page] as const,
};

export const adminApi = {
  overview: () => api.get<AdminOverview>("/admin/overview"),
  agencies: (status: AgencyFilter, page: number) =>
    api.get<Paginated<AdminAgencySummary>>("/admin/agencies", {
      query: { page, page_size: 20, ...(status === "all" ? {} : { status }) },
    }),
  agency: (id: string) => api.get<AdminAgency>(`/admin/agencies/${id}`),
  agencyAction: (id: string, action: AgencyAction, reason?: string) =>
    api.post<AdminAgency>(`/admin/agencies/${id}/${action}`, reason ? { reason } : {}),
  workers: ({ page, ...filters }: AdminWorkerFilters) =>
    api.get<Paginated<AdminWorker>>("/admin/workers", { query: { ...filters, page, page_size: 20 } }),
  worker: (id: string) => api.get<AdminWorkerDetail>(`/admin/workers/${id}`),
  flag: (id: string, kind: VerificationKind, reason: string) =>
    api.post<AdminWorkerDetail>(`/admin/workers/${id}/flag`, { kind, reason }),
  audit: (action: AuditAction | undefined, page: number) =>
    api.get<Paginated<AuditEntry>>("/admin/audit-log", {
      query: { page, page_size: 20, ...(action ? { action } : {}) },
    }),
  alerts: (state: AlertFilter, page: number) =>
    api.get<Paginated<AdminAlert>>("/admin/alerts", { query: { state, page, page_size: 20 } }),
  acknowledgeAlert: (id: string) => api.post<AdminAlert>(`/admin/alerts/${id}/acknowledge`, {}),
  resolveAlert: (id: string, body: { note: string; paystack_refund_id?: number }) =>
    api.post<AdminAlert>(`/admin/alerts/${id}/resolve`, body),
};
