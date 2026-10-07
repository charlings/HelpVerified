"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMonthlyRange } from "@/lib/format";
import { AcceptDialog } from "../components/AcceptDialog";
import { ProposalCard } from "../components/ProposalCard";
import { useCancelRequest, useDeclineProposal, useFamilyProposals, useFamilyRequest } from "../family-hooks";
import { requestStatus, scheduleLabel } from "../status";
import type { FamilyProposal } from "../types";

export function FamilyRequestDetailScreen({ requestId }: { requestId: string }) {
  const request = useFamilyRequest(requestId);
  const proposals = useFamilyProposals(requestId);
  const decline = useDeclineProposal(requestId);
  const cancel = useCancelRequest(requestId);
  const [accepting, setAccepting] = useState<FamilyProposal | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const back = { label: "All requests", href: routes.family.requests };

  if (request.isPending) {
    return (
      <WorkspacePage>
        <PageHeader title="Request" back={back} />
        <LoadingRegion label="Loading request">
          <Skeleton className="h-48" />
        </LoadingRegion>
      </WorkspacePage>
    );
  }
  if (request.isError) {
    const notFound = request.error instanceof ApiError && request.error.code === "NOT_FOUND";
    return (
      <WorkspacePage>
        <PageHeader title={notFound ? "Request not found" : "Request"} back={back} />
        <ErrorState error={request.error} onRetry={notFound ? undefined : () => request.refetch()} />
      </WorkspacePage>
    );
  }

  const r = request.data;
  const open = r.status === "open";
  const status = requestStatus[r.status];

  return (
    <WorkspacePage>
      <PageHeader
        title={r.title}
        description={`${services[r.role].name} · ${r.lga}, ${r.state}`}
        back={back}
        actions={
          open ? (
            <Button variant="secondary" shape="app" onClick={() => setConfirmCancel(true)}>
              Cancel request
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6">
        {r.status === "matched" && r.placement_id ? (
          <Alert tone="success" title="You've accepted a worker">
            <Link href={routes.family.placement(r.placement_id)} className="font-semibold underline">
              Go to the placement
            </Link>
          </Alert>
        ) : null}
        {r.replaces_placement_id ? (
          <Alert tone="info" title="Replacement request">
            Agencies can propose a new worker. Your free replacement covers the fee.
          </Alert>
        ) : null}

        <section
          aria-labelledby="request-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="request-heading" className="text-xl">
              Your request
            </h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-3 max-w-(--container-prose)">{r.description}</p>
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Schedule", `${scheduleLabel[r.schedule]}${r.live_in ? ", live-in" : ", live-out"}`],
              ["Area", `${r.lga}, ${r.state}`],
              ["Start date", formatDate(r.start_date)],
              ["Budget", formatMonthlyRange(r.budget_min_kobo, r.budget_max_kobo)],
              ["Trial", `${r.trial_days} days`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="proposals-heading">
          <h2 id="proposals-heading" className="mb-3 text-xl">
            Proposed workers
          </h2>
          {proposals.isPending ? (
            <LoadingRegion label="Loading proposals">
              <Skeleton className="h-40" />
            </LoadingRegion>
          ) : proposals.isError ? (
            <ErrorState error={proposals.error} onRetry={() => proposals.refetch()} />
          ) : proposals.data.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={open ? "No proposals yet" : "No proposals"}
              body={
                open
                  ? "Agencies near you will propose workers who have passed all four checks. We'll show them here."
                  : undefined
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {proposals.data.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  actionable={open}
                  onAccept={() => setAccepting(p)}
                  onDecline={() => decline.mutate(p.id)}
                  declining={decline.isPending && decline.variables === p.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <AcceptDialog request={r} proposal={accepting} onClose={() => setAccepting(null)} />
      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this request?"
        description="Agencies will no longer be able to propose workers, and any proposals waiting for you will close."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={() => setConfirmCancel(false)}>
            Keep request
          </Button>
          <Button
            shape="app"
            loading={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirmCancel(false) })}
          >
            Cancel request
          </Button>
        </div>
      </Dialog>
    </WorkspacePage>
  );
}
