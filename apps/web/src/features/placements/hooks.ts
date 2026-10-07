"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/Toast";
import { placementKeys, placementsApi, type PlacementFilters } from "./api";
import type { Placement } from "./types";

export function usePlacements(filters: PlacementFilters) {
  return useQuery({
    queryKey: placementKeys.list(filters),
    queryFn: () => placementsApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function usePlacement(id: string) {
  return useQuery({ queryKey: placementKeys.detail(id), queryFn: () => placementsApi.get(id) });
}

/**
 * Every placement action can change the worker's availability, request status, dashboards and
 * payments, so they all refresh the same set of queries. Dialogs show their own errors.
 */
export function usePlacementActions(id: string) {
  const client = useQueryClient();
  const toast = useToast();

  async function settle(placement: Placement, message: string) {
    client.setQueryData(placementKeys.detail(id), placement);
    await Promise.all(
      [
        placementKeys.all,
        ["workers"],
        ["agency", "dashboard"],
        ["family", "dashboard"],
        ["family-requests"],
        ["billing"],
        ["admin"],
      ].map((queryKey) => client.invalidateQueries({ queryKey })),
    );
    toast.success(message);
  }

  return {
    end: useMutation({
      mutationFn: (reason: string) => placementsApi.end(id, reason),
      onSuccess: (p) => settle(p, "Placement ended."),
    }),
    confirm: useMutation({
      mutationFn: () => placementsApi.confirm(id),
      onSuccess: (p) => settle(p, "Placement confirmed. Thank you for letting us know."),
    }),
    cancel: useMutation({
      mutationFn: (reason: string) => placementsApi.cancel(id, reason),
      onSuccess: (p) => settle(p, "Placement cancelled. Your request is open again."),
    }),
    replacement: useMutation({
      mutationFn: (reason: string) => placementsApi.requestReplacement(id, reason),
      onSuccess: (r) => settle(r.placement, "Replacement requested. Agencies can now propose someone new."),
    }),
    pay: useMutation({ mutationFn: () => placementsApi.pay(id) }),
  };
}
