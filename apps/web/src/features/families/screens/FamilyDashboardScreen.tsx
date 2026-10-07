"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { useSession } from "@/features/auth";
import { placementStatus } from "@/features/placements";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format";
import { familiesApi, familyKeys } from "../api";
import { textLink } from "@/components/ui/link-styles";

function trialNote(trialEndsOn: string | null) {
  if (!trialEndsOn) return null;
  const days = daysUntil(trialEndsOn);
  if (days > 1) return `Trial ends in ${days} days`;
  if (days === 1) return "Trial ends tomorrow";
  if (days === 0) return "Trial ends today";
  return `Trial ended ${formatDate(trialEndsOn)}`;
}

export function FamilyDashboardScreen() {
  const { user } = useSession();
  const query = useQuery({ queryKey: familyKeys.dashboard, queryFn: familiesApi.dashboard });
  const newRequest = (
    <Link href={routes.family.newRequest} className={buttonVariants({ shape: "app" })}>
      <Plus aria-hidden="true" className="size-4" />
      Post a request
    </Link>
  );
  const firstName = user?.full_name.split(/\s+/)[0];

  return (
    <WorkspacePage>
      <PageHeader title={firstName ? `Welcome, ${firstName}` : "Dashboard"} actions={newRequest} />
      {query.isPending ? (
        <LoadingRegion label="Loading dashboard">
          <Skeleton className="h-32" />
          <Skeleton className="mt-6 h-32" />
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.active_placements.length === 0 && query.data.open_requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Find help you can trust"
          body="Post a request and registered agencies near you will propose workers who have passed all four checks."
          action={newRequest}
        />
      ) : (
        <div className="grid gap-6">
          {query.data.active_placements
            .filter((p) => p.status === "pending_payment" && p.hold_expires_at)
            .map((p) => (
              <Alert key={p.id} tone="warning" title="Payment needed">
                Pay for {p.worker.full_name}&apos;s placement by {formatDateTime(p.hold_expires_at!)} to start the
                trial.{" "}
                <Link href={routes.family.placement(p.id)} className="font-semibold underline">
                  Go to the placement
                </Link>
              </Alert>
            ))}

          <section aria-labelledby="active-heading">
            <h2 id="active-heading" className="mb-3 text-xl">
              Your placements
            </h2>
            {query.data.active_placements.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong bg-white p-5 text-sm">
                No active placements. Accept a proposal to start a trial.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {query.data.active_placements.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={routes.family.placement(p.id)} className={textLink}>
                        {p.worker.full_name}
                      </Link>
                      <Badge tone={placementStatus[p.status].tone}>{placementStatus[p.status].label}</Badge>
                    </div>
                    <p className="mt-1 text-sm">
                      {services[p.worker.role].name} · {p.agency.name}
                    </p>
                    {p.status === "trial" ? (
                      <p className="mt-2 text-sm font-medium text-navy-900">{trialNote(p.trial_ends_on)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="requests-heading">
            <h2 id="requests-heading" className="mb-3 text-xl">
              Open requests
            </h2>
            {query.data.open_requests.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong bg-white p-5 text-sm">
                No open requests.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {query.data.open_requests.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border bg-white p-5 shadow-sm">
                    <Link href={routes.family.request(r.id)} className={textLink}>
                      {r.title}
                    </Link>
                    <p className="mt-1 text-sm">
                      {r.pending_proposals === 0
                        ? "Waiting for proposals"
                        : `${r.pending_proposals} ${r.pending_proposals === 1 ? "proposal" : "proposals"} to review`}
                    </p>
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
