"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/Toast";
import { messageForError } from "@/lib/error-messages";
import type { VerificationKind } from "@/types/domain";
import { verificationApi, verificationKeys } from "./api";
import type { VerificationDetails } from "./types";

export function useVerification(workerId: string) {
  return useQuery({ queryKey: verificationKeys.forWorker(workerId), queryFn: () => verificationApi.list(workerId) });
}

/**
 * Mutations for one check. Any change can alter the worker's listing status and counts,
 * so the worker, worker lists and dashboard are refreshed too.
 */
export function useCheckMutations(workerId: string, kind: VerificationKind) {
  const client = useQueryClient();
  const toast = useToast();

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: verificationKeys.forWorker(workerId) }),
      client.invalidateQueries({ queryKey: ["workers"] }),
      client.invalidateQueries({ queryKey: ["agency", "dashboard"] }),
    ]);
  const onError = (error: unknown) => toast.error(messageForError(error));

  return {
    saveDetails: useMutation({
      mutationFn: (details: VerificationDetails) => verificationApi.saveDetails(workerId, kind, details),
      onSuccess: async () => {
        await refresh();
        toast.success("Details saved.");
      },
      onError,
    }),
    verify: useMutation({
      mutationFn: () => verificationApi.verify(workerId, kind),
      onSuccess: async () => {
        await refresh();
        toast.success("Check verified.");
      },
      onError,
    }),
    reject: useMutation({
      mutationFn: (reason: string) => verificationApi.reject(workerId, kind, reason),
      onSuccess: async () => {
        await refresh();
        toast.success("Check rejected.");
      },
      // The reject dialog shows validation errors itself.
    }),
    removeDocument: useMutation({
      mutationFn: (documentId: string) => verificationApi.removeDocument(workerId, kind, documentId),
      onSuccess: async () => {
        await refresh();
        toast.success("Document removed.");
      },
      onError,
    }),
    upload: useMutation({
      mutationFn: ({ file, onProgress }: { file: File; onProgress: (p: number) => void }) =>
        verificationApi.uploadDocument(workerId, kind, file, onProgress),
      onSuccess: async () => {
        await refresh();
        toast.success("Document uploaded.");
      },
      onError: (error) =>
        toast.error(
          error instanceof Error && error.name === "UploadError"
            ? "The upload failed. Try again."
            : messageForError(error),
        ),
    }),
  };
}
