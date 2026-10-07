"use client";

import { Building2, CalendarClock, Plus, Users } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/data/StatCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { useSession } from "@/features/auth";
import { formatDate } from "@/lib/format";
import { AgencyActivityBanner } from "../components/AgencyActivityBanner";
import { useAgencyDashboard } from "../hooks";
import { textLink } from "@/components/ui/link-styles";

export function AgencyDashboardScreen() {
  const { user } = useSession();
  const hasAgency = Boolean(user?.agency);
  const query = useAgencyDashboard(hasAgency);
  const addWorker = (
    <Link href={routes.agency.newWorker} className={buttonVariants({ shape: "app" })}>
      <Plus aria-hidden="true" className="size-4" />
      Add worker
    </Link>
  );

  return (
    <WorkspacePage>
      <PageHeader title="Dashboard" description={query.data?.agency.name} actions={hasAgency ? addWorker : undefined} />

      {!hasAgency ? (
        <EmptyState
          icon={Building2}
          title="Register your agency to get started"
          body="Tell us about your agency so our team can review it. You can add workers once it's registered."
          action={
            <Link href={routes.auth.agencySignup} className={buttonVariants({ shape: "app" })}>
              Register your agency
            </Link>
          }
        />
      ) : query.isPending ? (
        <LoadingRegion label="Loading dashboard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="mt-6 h-40" />
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-6">
          <AgencyActivityBanner dashboard={query.data} />

          {query.data.workers.total === 0 ? (
            <EmptyState
              icon={Users}
              title="No workers yet"
              body="Add the nannies, drivers and cleaners you represent, then complete their four checks."
              action={addWorker}
            />
          ) : (
            <section aria-labelledby="workers-heading">
              <h2 id="workers-heading" className="sr-only">
                Workers
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Listed workers"
                  value={query.data.workers.listed}
                  href={`${routes.agency.workers}?listing_status=listed`}
                />
                <StatCard
                  label="Drafts"
                  value={query.data.workers.draft}
                  href={`${routes.agency.workers}?listing_status=draft`}
                />
                <StatCard
                  label="Delisted"
                  value={query.data.workers.delisted}
                  href={`${routes.agency.workers}?listing_status=delisted`}
                />
                <StatCard label="Checks needing attention" value={query.data.checks_needing_attention} />
                <StatCard label="Open requests" value={query.data.open_requests} href={routes.agency.requests} />
              </div>
            </section>
          )}

          <section aria-labelledby="trials-heading" className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <h2 id="trials-heading" className="flex items-center gap-2 text-xl">
              <CalendarClock aria-hidden="true" className="size-5 text-blue-600" />
              Trials ending soon
            </h2>
            {query.data.trials_ending.length === 0 ? (
              <p className="mt-3 text-sm">No trials end in the next 3 days.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {query.data.trials_ending.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <Link href={routes.agency.placement(t.id)} className={textLink}>
                      {t.worker_name} with the {t.family_name}
                    </Link>
                    <span className="text-sm">Trial ends {formatDate(t.trial_ends_on)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </WorkspacePage>
  );
}
