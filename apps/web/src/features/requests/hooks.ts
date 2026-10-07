"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/Toast";
import { messageForError } from "@/lib/error-messages";
import { requestKeys, requestsApi } from "./api";

export function useAgencyRequests(page: number) {
  return useQuery({
    queryKey: requestKeys.list(page),
    queryFn: () => requestsApi.list(page),
    placeholderData: (previous) => previous,
  });
}

export function useAgencyRequest(id: string) {
  return useQuery({ queryKey: requestKeys.detail(id), queryFn: () => requestsApi.get(id) });
}

export function useRequestProposals(id: string) {
  return useQuery({ queryKey: requestKeys.proposals(id), queryFn: () => requestsApi.proposals(id) });
}

/** Proposals change the request's counts, the worker lists and the dashboard. */
export function useRefreshAfterProposal(requestId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: requestKeys.proposals(requestId) }),
      client.invalidateQueries({ queryKey: requestKeys.detail(requestId) }),
      client.invalidateQueries({ queryKey: [...requestKeys.all, "list"] }),
      client.invalidateQueries({ queryKey: ["workers"] }),
    ]);
}

export function useWithdrawProposal(requestId: string) {
  const toast = useToast();
  const refresh = useRefreshAfterProposal(requestId);
  return useMutation({
    mutationFn: (proposalId: string) => requestsApi.withdraw(proposalId),
    onSuccess: async () => {
      await refresh();
      toast.success("Proposal withdrawn.");
    },
    onError: (error) => toast.error(messageForError(error)),
  });
}
