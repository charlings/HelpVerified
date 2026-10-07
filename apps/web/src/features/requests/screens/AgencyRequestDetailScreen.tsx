"use client";

import { useId, useState } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { AgencyActivityBanner, useAgencyDashboard } from "@/features/agencies";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMonthlyRange } from "@/lib/format";
import { ProposeDialog } from "../components/ProposeDialog";
import { useAgencyRequest, useRequestProposals, useWithdrawProposal } from "../hooks";
import { proposalStatus, requestStatus, scheduleLabel } from "../status";

export function AgencyRequestDetailScreen({ requestId }: { requestId: string }) {
  const request = useAgencyRequest(requestId);
  const proposals = useRequestProposals(requestId);
  const dashboard = useAgencyDashboard();
  const withdraw = useWithdrawProposal(requestId);
  const [proposing, setProposing] = useState(false);
  const reasonId = useId();
  const back = { label: "All requests", href: routes.agency.requests };

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
        <ErrorState
          error={request.error}
          title={notFound ? "This request doesn't exist or isn't open to your agency" : undefined}
          onRetry={notFound ? undefined : () => request.refetch()}
        />
      </WorkspacePage>
    );
  }

  const r = request.data;
  const active = dashboard.data?.active ?? false;
  const blocked =
    r.status !== "open" ? "This request is no longer open." : !active ? "Your agency can't propose workers yet." : null;
  const status = requestStatus[r.status];

  return (
    <WorkspacePage>
      <PageHeader
        title={r.title}
        description={`${services[r.role].name} · ${r.lga}, ${r.state}`}
        back={back}
        actions={
          <Button
            shape="app"
            disabled={Boolean(blocked) || dashboard.isPending}
            aria-describedby={blocked ? reasonId : undefined}
            onClick={() => setProposing(true)}
          >
            Propose a worker
          </Button>
        }
      />
      <div className="grid gap-6">
        {dashboard.data ? <AgencyActivityBanner dashboard={dashboard.data} /> : null}
        {blocked ? (
          <p id={reasonId} className="-mt-2 text-sm text-slate-600">
            {blocked}
          </p>
        ) : null}

        <section
          aria-labelledby="request-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="request-heading" className="text-xl">
              About this request
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
              ["Posted", formatDate(r.created_at.slice(0, 10))],
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
            Your proposals
          </h2>
          {proposals.isPending ? (
            <LoadingRegion label="Loading proposals">
              <Skeleton className="h-20" />
            </LoadingRegion>
          ) : proposals.isError ? (
            <ErrorState error={proposals.error} onRetry={() => proposals.refetch()} />
          ) : proposals.data.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong bg-white p-5 text-sm">
              You haven&apos;t proposed anyone for this request yet.
            </p>
          ) : (
            <ul className="grid gap-3">
              {proposals.data.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-navy-900">{p.worker.full_name}</p>
                    {p.note ? <p className="mt-1 text-sm">&ldquo;{p.note}&rdquo;</p> : null}
                    <p className="mt-1 text-xs text-slate-600">Proposed {formatDate(p.created_at.slice(0, 10))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={proposalStatus[p.status].tone}>{proposalStatus[p.status].label}</Badge>
                    {p.status === "pending" ? (
                      <Button
                        variant="ghost"
                        shape="app"
                        loading={withdraw.isPending && withdraw.variables === p.id}
                        aria-label={`Withdraw proposal for ${p.worker.full_name}`}
                        onClick={() => withdraw.mutate(p.id)}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ProposeDialog open={proposing} onOpenChange={setProposing} request={r} proposals={proposals.data ?? []} />
    </WorkspacePage>
  );
}
