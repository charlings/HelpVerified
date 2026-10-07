"use client";

import Link from "next/link";
import { StatCard } from "@/components/data/StatCard";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { isMocking } from "@/config/env";
import { routes } from "@/config/routes";
import { formatDate, formatNaira } from "@/lib/format";
import { AuditList } from "../components/AuditList";
import { useAdminOverview } from "../hooks";
import { textLink } from "@/components/ui/link-styles";

export function AdminOverviewScreen() {
  const query = useAdminOverview();

  return (
    <WorkspacePage>
      <PageHeader title="Overview" description="What needs attention across HelpVerified." />
      {query.isPending ? (
        <LoadingRegion label="Loading overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="mt-6 h-48" />
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-6">
          <section aria-labelledby="numbers-heading">
            <h2 id="numbers-heading" className="sr-only">
              Key numbers
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                label="Agencies awaiting approval"
                value={query.data.agencies_pending}
                href={`${routes.admin.agencies}?status=pending`}
              />
              <StatCard label="Listed workers" value={query.data.workers_listed} href={routes.admin.workers} />
              <StatCard label="Active placements" value={query.data.placements_active} href={routes.admin.placements} />
              <StatCard label="Trials ending in 3 days" value={query.data.trials_ending_soon} />
              <StatCard label="Placement fees this month" value={formatNaira(query.data.fees_paid_this_month_kobo)} />
            </div>
            {isMocking ? <p className="mt-2 text-sm">Amounts in demo mode are examples.</p> : null}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section
              aria-labelledby="pending-heading"
              className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
            >
              <h2 id="pending-heading" className="mb-4 text-xl">
                Awaiting approval
              </h2>
              {query.data.pending_agencies.length === 0 ? (
                <p className="text-sm">No agencies are waiting. New applications appear here.</p>
              ) : (
                <ul className="grid gap-3">
                  {query.data.pending_agencies.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={routes.admin.agency(a.id)} className={textLink}>
                        {a.name}
                      </Link>
                      <span className="text-sm">
                        {a.lga}, {a.state} · applied {formatDate(a.created_at.slice(0, 10))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="activity-heading"
              className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="activity-heading" className="text-xl">
                  Recent admin activity
                </h2>
                <Link href={routes.admin.audit} className={`${textLink} text-sm`}>
                  Full audit log
                </Link>
              </div>
              {query.data.recent_audit.length === 0 ? (
                <p className="text-sm">Nothing recorded yet.</p>
              ) : (
                <AuditList entries={query.data.recent_audit} />
              )}
            </section>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
