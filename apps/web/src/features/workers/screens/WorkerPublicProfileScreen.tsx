"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { verificationKindInfo } from "@/features/verification";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { verificationKinds } from "@/types/domain";
import { workerKeys, workersApi } from "../api";

/** What a family sees about a proposed worker: outcomes and dates of the four checks, never documents. */
export function WorkerPublicProfileScreen({ workerId }: { workerId: string }) {
  const query = useQuery({ queryKey: workerKeys.public(workerId), queryFn: () => workersApi.getPublic(workerId) });
  const back = { label: "Your requests", href: routes.family.requests };

  if (query.isPending) {
    return (
      <WorkspacePage>
        <PageHeader title="Worker" back={back} />
        <LoadingRegion label="Loading profile">
          <Skeleton className="h-64" />
        </LoadingRegion>
      </WorkspacePage>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.code === "NOT_FOUND";
    return (
      <WorkspacePage>
        <PageHeader title={notFound ? "Profile not available" : "Worker"} back={back} />
        <ErrorState
          error={query.error}
          title={
            notFound
              ? "You can see a worker's profile once an agency proposes them for one of your requests"
              : undefined
          }
          onRetry={notFound ? undefined : () => query.refetch()}
        />
      </WorkspacePage>
    );
  }

  const w = query.data;
  return (
    <WorkspacePage>
      <PageHeader title={w.first_name} description={`${services[w.role].name} · from ${w.agency.name}`} back={back} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section
          aria-labelledby="about-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-center gap-4">
            <Avatar name={w.first_name} size="lg" />
            <Badge tone={w.available ? "success" : "neutral"}>
              {w.available ? "Available" : "Placed with another family"}
            </Badge>
          </div>
          <h2 id="about-heading" className="mt-5 text-xl">
            About {w.first_name}
          </h2>
          <dl className="mt-3 grid gap-3">
            {[
              ["Experience", `${w.years_experience} years`],
              ["Languages", w.languages.join(", ")],
              ["Live-in", w.live_in_ok ? "Open to live-in roles" : "Live-out only"],
              ["Agency", w.agency.name],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="checks-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="checks-heading" className="flex items-center gap-2 text-xl">
            <ShieldCheck aria-hidden="true" className="size-5 text-blue-600" />
            Checks
          </h2>
          <p className="mt-2 text-sm">
            {w.agency.name} carried out these checks and recorded the evidence with HelpVerified. You see when each was
            verified; the documents themselves stay private.
          </p>
          <ul className="mt-4 grid gap-3">
            {verificationKinds.map((kind) => {
              const badge = w.badges.find((b) => b.kind === kind);
              const info = verificationKindInfo[kind];
              return (
                <li key={kind} className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-slate-50 p-3">
                  <div>
                    <p className="font-semibold text-navy-900">{info.label}</p>
                    <p className="text-sm">{info.summary}</p>
                  </div>
                  {badge ? (
                    <Badge tone="verified">Verified {formatDate(badge.verified_at.slice(0, 10))}</Badge>
                  ) : (
                    <Badge tone="neutral">Not verified</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </WorkspacePage>
  );
}
