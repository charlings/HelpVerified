"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { routes } from "@/config/routes";
import { useSession } from "@/features/auth";
import { familiesApi, familyKeys } from "../api";

function Details({ title, rows }: { title: string; rows: [string, string][] }) {
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

export function FamilySettingsScreen() {
  const { user } = useSession();
  const profile = useQuery({ queryKey: familyKeys.profile, queryFn: familiesApi.profile });

  return (
    <WorkspacePage>
      <PageHeader title="Settings" description="Your account and family details." />
      <div className="grid gap-6">
        {user ? (
          <Details
            title="Your account"
            rows={[
              ["Name", user.full_name],
              ["Email", user.email],
            ]}
          />
        ) : null}
        {profile.isPending ? (
          <LoadingRegion label="Loading family details">
            <Skeleton className="h-32" />
          </LoadingRegion>
        ) : profile.isError ? (
          <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
        ) : profile.data === null ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-white p-5 text-sm">
            Your family&apos;s area is set from your first request.
          </p>
        ) : (
          <Details
            title="Family"
            rows={[
              ["Family name", profile.data.name],
              ["Area", `${profile.data.lga}, ${profile.data.state}`],
            ]}
          />
        )}
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
