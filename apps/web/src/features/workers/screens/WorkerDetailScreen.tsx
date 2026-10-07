"use client";

import { useId } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { AgencyActivityBanner, useAgencyDashboard } from "@/features/agencies";
import { VerificationChecklist } from "@/features/verification";
import { ApiError } from "@/lib/api-client";
import { formatNaira } from "@/lib/format";
import { useListingMutations, useWorker } from "../hooks";
import { listingDecision } from "../listing";
import { availabilityLabel, listingStatus } from "../status";
import type { Worker } from "../types";

function salaryRange(w: Worker) {
  if (w.expected_salary_min_kobo === null && w.expected_salary_max_kobo === null) return "Not given";
  const min = w.expected_salary_min_kobo === null ? "" : formatNaira(w.expected_salary_min_kobo);
  const max = w.expected_salary_max_kobo === null ? "" : formatNaira(w.expected_salary_max_kobo);
  return `${min}${min && max ? " – " : ""}${max} a month`;
}

export function WorkerDetailScreen({ workerId }: { workerId: string }) {
  const worker = useWorker(workerId);
  const dashboard = useAgencyDashboard();
  const reasonId = useId();
  const listing = useListingMutations(workerId);
  const back = { label: "All workers", href: routes.agency.workers };

  if (worker.isPending) {
    return (
      <WorkspacePage>
        <PageHeader title="Worker" back={back} />
        <LoadingRegion label="Loading worker">
          <Skeleton className="h-40" />
        </LoadingRegion>
      </WorkspacePage>
    );
  }
  if (worker.isError) {
    const notFound = worker.error instanceof ApiError && worker.error.code === "NOT_FOUND";
    return (
      <WorkspacePage>
        <PageHeader title={notFound ? "Worker not found" : "Worker"} back={back} />
        <ErrorState
          error={worker.error}
          title={notFound ? "This worker doesn't exist or isn't part of your agency" : undefined}
          onRetry={notFound ? undefined : () => worker.refetch()}
        />
      </WorkspacePage>
    );
  }

  const w = worker.data;
  const agencyActive = dashboard.data?.active ?? false;
  const decision = listingDecision(w, agencyActive);
  const status = listingStatus[w.listing_status];

  const actions =
    w.listing_status === "listed" ? (
      <Button
        variant="secondary"
        shape="app"
        loading={listing.delist.isPending}
        onClick={() => listing.delist.mutate()}
      >
        Delist worker
      </Button>
    ) : (
      <Button
        shape="app"
        disabled={!decision.canList || dashboard.isPending}
        aria-describedby={decision.canList ? undefined : reasonId}
        loading={listing.list.isPending}
        onClick={() => listing.list.mutate()}
      >
        List worker
      </Button>
    );

  return (
    <WorkspacePage>
      <PageHeader
        title={w.full_name}
        description={`${services[w.role].name} · ${w.years_experience} years' experience`}
        back={back}
        actions={actions}
      />

      <div className="grid gap-6">
        {dashboard.data ? <AgencyActivityBanner dashboard={dashboard.data} /> : null}
        {!decision.canList && w.listing_status !== "listed" ? (
          <p id={reasonId} className="-mt-2 text-sm text-slate-600">
            Can&apos;t list yet: {decision.reason}
          </p>
        ) : null}

        <section
          aria-labelledby="profile-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={w.full_name} size="lg" />
            <div className="flex flex-wrap gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone={w.available ? "success" : "info"}>{availabilityLabel(w)}</Badge>
            </div>
          </div>
          <h2 id="profile-heading" className="sr-only">
            Profile
          </h2>
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Area", `${w.lga}, ${w.state}`],
              ["Languages", w.languages.join(", ")],
              ["Live-in", w.live_in_ok ? "Open to live-in" : "Live-out only"],
              ["Expected salary", salaryRange(w)],
              ["NIN", `Ending ${w.nin_last4}`],
              ["Listing", status.description],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="checks-heading">
          <h2 id="checks-heading" className="mb-3 text-2xl">
            The four checks
          </h2>
          <VerificationChecklist workerId={w.id} />
        </section>
      </div>
    </WorkspacePage>
  );
}
