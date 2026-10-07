"use client";

import { useState } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkerRole } from "@/types/domain";
import { AgencyActionDialog } from "../components/AgencyActionDialog";
import { AuditList } from "../components/AuditList";
import { useAdminAgency } from "../hooks";
import { agencyAction, agencyStatus } from "../status";
import type { AgencyAction } from "../types";

function Details({ id, title, rows }: { id: string; title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6">
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="mt-0.5 font-medium break-words text-navy-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AdminAgencyDetailScreen({ agencyId }: { agencyId: string }) {
  const query = useAdminAgency(agencyId);
  const [action, setAction] = useState<AgencyAction | null>(null);
  const back = { label: "All agencies", href: routes.admin.agencies };

  if (query.isPending) {
    return (
      <WorkspacePage>
        <PageHeader title="Agency" back={back} />
        <LoadingRegion label="Loading agency">
          <Skeleton className="h-64" />
        </LoadingRegion>
      </WorkspacePage>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.code === "NOT_FOUND";
    return (
      <WorkspacePage>
        <PageHeader title={notFound ? "Agency not found" : "Agency"} back={back} />
        <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />
      </WorkspacePage>
    );
  }

  const a = query.data;
  const status = agencyStatus[a.status];

  return (
    <WorkspacePage>
      <PageHeader
        title={a.name}
        description={`${a.lga}, ${a.state}`}
        back={back}
        actions={
          a.allowed_actions.length > 0
            ? a.allowed_actions.map((act) => (
                <Button key={act} variant={agencyAction[act].variant} shape="app" onClick={() => setAction(act)}>
                  {agencyAction[act].label}
                </Button>
              ))
            : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-6">
          <section
            aria-labelledby="status-heading"
            className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="status-heading" className="text-xl">
                Status
              </h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-2 text-sm">{status.description}</p>
            {a.status_reason ? (
              <Alert
                tone={a.status === "suspended" ? "danger" : "info"}
                title="Reason given to the agency"
                className="mt-4"
              >
                {a.status_reason}
              </Alert>
            ) : null}
          </section>

          <Details
            id="business-heading"
            title="Business"
            rows={[
              ["CAC number", a.cac_number],
              ["Roles", a.roles_offered.map((r) => services[r as WorkerRole].plural).join(", ")],
              ["Office address", `${a.address_line}, ${a.lga}, ${a.state}`],
              ["Applied", formatDateTime(a.created_at)],
              ["Approved", a.approved_at ? formatDateTime(a.approved_at) : "Not yet"],
            ]}
          />
          <Details
            id="contact-heading"
            title="Contact"
            rows={[
              ["Business email", a.email],
              ["Business phone", a.phone],
              ["Account holder", a.admin ? `${a.admin.full_name} (${a.admin.email})` : "—"],
            ]}
          />
          <Details
            id="activity-heading"
            title="Workers and placements"
            rows={[
              ["Workers", String(a.workers.total)],
              ["Listed", String(a.workers.listed)],
              ["Drafts", String(a.workers.draft)],
              ["Delisted", String(a.workers.delisted)],
              ["Hidden by suspension", String(a.workers.suspended)],
              ["Active placements", String(a.active_placements)],
              [
                "Subscription",
                a.subscription
                  ? `${a.subscription.status === "active" ? "Active" : `Not active (${a.subscription.status.replace("_", " ")})`}, period ends ${formatDate(a.subscription.current_period_end.slice(0, 10))}`
                  : "None",
              ],
            ]}
          />
        </div>

        <section
          aria-labelledby="history-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="history-heading" className="mb-4 text-xl">
            History
          </h2>
          {a.history.length === 0 ? (
            <p className="text-sm">No admin decisions yet.</p>
          ) : (
            <AuditList entries={a.history} linkEntities={false} />
          )}
        </section>
      </div>

      <AgencyActionDialog agency={a} action={action} onClose={() => setAction(null)} />
    </WorkspacePage>
  );
}
