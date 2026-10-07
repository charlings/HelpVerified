"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/Toast";
import type { VerificationKind } from "@/types/domain";
import { adminApi, adminKeys, type AdminWorkerFilters, type AgencyFilter } from "./api";
import { agencyAction } from "./status";
import type { AgencyAction, AuditAction } from "./types";

export function useAdminOverview() {
  return useQuery({ queryKey: adminKeys.overview, queryFn: adminApi.overview });
}

export function useAdminAgencies(status: AgencyFilter, page: number) {
  return useQuery({
    queryKey: adminKeys.agencies(status, page),
    queryFn: () => adminApi.agencies(status, page),
    placeholderData: (previous) => previous,
  });
}

export function useAdminAgency(id: string) {
  return useQuery({ queryKey: adminKeys.agency(id), queryFn: () => adminApi.agency(id) });
}

export function useAdminWorkers(filters: AdminWorkerFilters) {
  return useQuery({
    queryKey: adminKeys.workers(filters),
    queryFn: () => adminApi.workers(filters),
    placeholderData: (previous) => previous,
  });
}

export function useAdminWorker(id: string) {
  return useQuery({ queryKey: adminKeys.worker(id), queryFn: () => adminApi.worker(id) });
}

/** Flag a verified check. The worker is delisted by the API; every admin view and listing refreshes. */
export function useFlagCheck(workerId: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ kind, reason }: { kind: VerificationKind; reason: string }) => adminApi.flag(workerId, kind, reason),
    onSuccess: async (worker) => {
      client.setQueryData(adminKeys.worker(workerId), worker);
      await Promise.all([adminKeys.all, ["workers"]].map((queryKey) => client.invalidateQueries({ queryKey })));
      toast.success(`Check flagged and sent back to ${worker.agency.name}.`);
    },
  });
}

export function useAuditLog(action: AuditAction | undefined, page: number) {
  return useQuery({
    queryKey: adminKeys.audit(action, page),
    queryFn: () => adminApi.audit(action, page),
    placeholderData: (previous) => previous,
  });
}

/** Approve, reject, suspend or reinstate. Refreshes every admin view; the dialog shows errors. */
export function useAgencyAction(id: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ action, reason }: { action: AgencyAction; reason?: string }) =>
      adminApi.agencyAction(id, action, reason),
    onSuccess: async (agency, { action }) => {
      client.setQueryData(adminKeys.agency(id), agency);
      await client.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(`${agency.name} ${agencyAction[action].done}.`);
    },
  });
}
