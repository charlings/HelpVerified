"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/Toast";
import { messageForError } from "@/lib/error-messages";
import { familyRequestKeys, familyRequestsApi } from "./family-api";

export function useFamilyRequests(page: number) {
  return useQuery({
    queryKey: familyRequestKeys.list(page),
    queryFn: () => familyRequestsApi.list(page),
    placeholderData: (previous) => previous,
  });
}

export function useFamilyRequest(id: string) {
  return useQuery({ queryKey: familyRequestKeys.detail(id), queryFn: () => familyRequestsApi.get(id) });
}

export function useFamilyProposals(id: string) {
  return useQuery({ queryKey: familyRequestKeys.proposals(id), queryFn: () => familyRequestsApi.proposals(id) });
}

export function useRefreshFamilyRequest(id: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: familyRequestKeys.all }),
      client.invalidateQueries({ queryKey: ["placements"] }),
      client.invalidateQueries({ queryKey: ["family", "dashboard"] }),
      client.invalidateQueries({ queryKey: familyRequestKeys.detail(id) }),
    ]);
}

export function useDeclineProposal(requestId: string) {
  const toast = useToast();
  const refresh = useRefreshFamilyRequest(requestId);
  return useMutation({
    mutationFn: (proposalId: string) => familyRequestsApi.decline(proposalId),
    onSuccess: async () => {
      await refresh();
      toast.success("Proposal declined.");
    },
    onError: (error) => toast.error(messageForError(error)),
  });
}

export function useCancelRequest(requestId: string) {
  const toast = useToast();
  const refresh = useRefreshFamilyRequest(requestId);
  return useMutation({
    mutationFn: () => familyRequestsApi.cancel(requestId),
    onSuccess: async () => {
      await refresh();
      toast.success("Request cancelled.");
    },
    onError: (error) => toast.error(messageForError(error)),
  });
}
