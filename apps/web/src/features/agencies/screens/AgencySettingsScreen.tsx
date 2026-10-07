"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { useSession } from "@/features/auth";
import type { AgencyStatus } from "@/types/domain";
import { agenciesApi, agencyKeys } from "../api";

const agencyStatus: Record<AgencyStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
  rejected: { label: "Not approved", tone: "danger" },
};

function roleName(slug: string) {
  return slug in services ? services[slug as keyof typeof services].plural : slug;
}

function Details({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  const id = `settings-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6">
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AgencySettingsScreen() {
  const { user } = useSession();
  const profile = useQuery({ queryKey: agencyKeys.profile, queryFn: agenciesApi.profile });

  return (
    <WorkspacePage>
      <PageHeader title="Settings" description="Your agency's registered details and your account." />
      <div className="grid gap-6">
        {profile.isPending ? (
          <LoadingRegion label="Loading agency details">
            <Skeleton className="h-56" />
          </LoadingRegion>
        ) : profile.isError ? (
          <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
        ) : (
          <Details
            title="Agency"
            rows={[
              ["Name", profile.data.name],
              [
                "Status",
                <Badge key="s" tone={agencyStatus[profile.data.status].tone}>
                  {agencyStatus[profile.data.status].label}
                </Badge>,
              ],
              ["CAC number", profile.data.cac_number],
              ["Email", profile.data.email],
              ["Phone", profile.data.phone],
              ["Address", `${profile.data.address_line}, ${profile.data.lga}, ${profile.data.state}`],
              ["Roles placed", profile.data.roles_offered.map(roleName).join(", ")],
            ]}
          />
        )}
        {user ? (
          <Details
            title="Your account"
            rows={[
              ["Name", user.full_name],
              ["Email", user.email],
            ]}
          />
        ) : null}
        <p className="text-sm">
          Need to change these details?{" "}
          <Link href={routes.contact} className="font-semibold text-blue-600 hover:underline">
            Contact us
          </Link>
          . Self-service editing is coming later.
        </p>
      </div>
    </WorkspacePage>
  );
}
