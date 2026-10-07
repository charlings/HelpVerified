"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/Toast";
import { messageForError } from "@/lib/error-messages";
import { workerKeys, workersApi } from "./api";
import type { WorkerFilters } from "./types";

export function useWorkers(filters: WorkerFilters) {
  return useQuery({
    queryKey: workerKeys.list(filters),
    queryFn: () => workersApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useWorker(id: string) {
  return useQuery({ queryKey: workerKeys.detail(id), queryFn: () => workersApi.get(id) });
}

export function useListingMutations(id: string) {
  const client = useQueryClient();
  const toast = useToast();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: workerKeys.all }),
      client.invalidateQueries({ queryKey: ["agency", "dashboard"] }),
    ]);
  // A refused listing usually means the server knows something newer (a check expired): refresh to show it.
  const onError = async (error: unknown) => {
    toast.error(messageForError(error));
    await refresh();
  };

  return {
    list: useMutation({
      mutationFn: () => workersApi.listWorker(id),
      onSuccess: async () => {
        await refresh();
        toast.success("Worker listed. Families can now be offered this worker.");
      },
      onError,
    }),
    delist: useMutation({
      mutationFn: () => workersApi.delistWorker(id),
      onSuccess: async () => {
        await refresh();
        toast.success("Worker delisted.");
      },
      onError,
    }),
  };
}
