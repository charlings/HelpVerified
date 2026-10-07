"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/feedback/Toast";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { availabilityLabel, workerKeys, workersApi, type Worker } from "@/features/workers";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { cn } from "@/lib/cn";
import { requestsApi } from "../api";
import { useRefreshAfterProposal } from "../hooks";
import type { AgencyRequest, Proposal } from "../types";

type ProposeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: AgencyRequest;
  proposals: Proposal[];
};

/**
 * Offers one listed worker for a request. Only listed workers of the requested role appear; anyone in an
 * active placement or already proposed is shown but can't be chosen, with the reason.
 */
export function ProposeDialog({ open, onOpenChange, request, proposals }: ProposeDialogProps) {
  const toast = useToast();
  const refresh = useRefreshAfterProposal(request.id);
  const legendId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filters = { role: request.role, listing_status: "listed" as const, page: 1 };
  const workers = useQuery({
    queryKey: workerKeys.list(filters),
    queryFn: () => workersApi.list(filters, 100),
    enabled: open,
  });

  const alreadyProposed = new Set(proposals.filter((p) => p.status !== "withdrawn").map((p) => p.worker.id));
  const reasonUnavailable = (w: Worker) =>
    alreadyProposed.has(w.id) ? "Already proposed for this request" : !w.available ? availabilityLabel(w) : null;

  const propose = useMutation({
    mutationFn: () => requestsApi.propose(request.id, workerId!, note.trim()),
    onSuccess: async (proposal) => {
      await refresh();
      toast.success(`${proposal.worker.full_name} proposed. We'll tell you when the family responds.`);
      setWorkerId(null);
      setNote("");
      onOpenChange(false);
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === "WORKER_UNAVAILABLE") {
        setError("This worker has just been placed with another family. Choose someone else.");
        setWorkerId(null);
        await workers.refetch();
        return;
      }
      setError(e instanceof ApiError && e.fields?.worker_id?.[0] ? e.fields.worker_id[0] : messageForError(e));
    },
  });

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!workerId) {
      setError("Choose a worker to propose.");
      return;
    }
    propose.mutate();
  }

  const roleName = services[request.role].name.toLowerCase();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={`Propose a ${roleName}`}
      description={`For: ${request.title}. The family sees the worker's profile and the dates of their four checks, never their documents.`}
      size="lg"
    >
      <form noValidate onSubmit={submit} className="grid gap-5">
        {error ? (
          <Alert ref={alertRef} tone="danger">
            {error}
          </Alert>
        ) : null}

        {workers.isPending ? (
          <LoadingRegion label="Loading workers">
            <div className="grid gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </LoadingRegion>
        ) : workers.isError ? (
          <ErrorState error={workers.error} onRetry={() => workers.refetch()} />
        ) : workers.data.items.length === 0 ? (
          <p>
            You have no listed {services[request.role].plural.toLowerCase()} yet.{" "}
            <Link href={routes.agency.workers} className="font-semibold text-blue-600 underline">
              Go to your workers
            </Link>
          </p>
        ) : (
          <fieldset aria-labelledby={legendId} className="grid gap-2">
            <legend id={legendId} className="mb-1 text-sm font-semibold text-navy-900">
              Listed {services[request.role].plural.toLowerCase()}
            </legend>
            {workers.data.items.map((w) => {
              const unavailable = reasonUnavailable(w);
              const id = `propose-${w.id}`;
              return (
                <label
                  key={w.id}
                  htmlFor={id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border border-border p-3",
                    unavailable
                      ? "cursor-not-allowed bg-slate-50 text-slate-600"
                      : "cursor-pointer hover:border-blue-600 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50",
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name="worker"
                    value={w.id}
                    disabled={Boolean(unavailable)}
                    checked={workerId === w.id}
                    onChange={() => setWorkerId(w.id)}
                    className="size-4 accent-blue-600"
                  />
                  <Avatar name={w.full_name} size="sm" />
                  <span className="flex-1">
                    <span className={cn("block font-semibold", unavailable ? "text-slate-600" : "text-navy-900")}>
                      {w.full_name}
                    </span>
                    <span className="block text-sm">
                      {w.years_experience} years · {w.lga}
                      {unavailable ? ` · ${unavailable}` : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <FormField
          id="propose-note"
          label="Note for the family"
          optionalLabel
          hint="Why this worker is a good fit. Up to 500 characters."
        >
          {(control) => (
            <Textarea {...control} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </FormField>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" shape="app" loading={propose.isPending}>
            Propose worker
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
