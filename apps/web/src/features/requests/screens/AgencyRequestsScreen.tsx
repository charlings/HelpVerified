"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { formatDate, formatMonthlyRange } from "@/lib/format";
import { useAgencyRequests } from "../hooks";
import { scheduleLabel } from "../status";
import type { AgencyRequest } from "../types";
import { textLink } from "@/components/ui/link-styles";

const columns: Column<AgencyRequest>[] = [
  {
    key: "title",
    header: "Request",
    primary: true,
    cell: (r) => (
      <Link href={routes.agency.request(r.id)} className={textLink}>
        {r.title}
      </Link>
    ),
  },
  { key: "role", header: "Role", cell: (r) => services[r.role].name },
  { key: "area", header: "Area", cell: (r) => `${r.lga}, ${r.state}` },
  { key: "schedule", header: "Schedule", cell: (r) => `${scheduleLabel[r.schedule]}${r.live_in ? ", live-in" : ""}` },
  { key: "start", header: "Starts", cell: (r) => formatDate(r.start_date) },
  { key: "budget", header: "Budget", cell: (r) => formatMonthlyRange(r.budget_min_kobo, r.budget_max_kobo) },
  { key: "proposals", header: "Your proposals", cell: (r) => r.my_proposals },
];

export function AgencyRequestsScreen() {
  const [page, setPage] = useState(1);
  const query = useAgencyRequests(page);

  return (
    <WorkspacePage>
      <PageHeader
        title="Requests"
        description="Open requests from families for the roles you place, in the area you cover."
      />
      {query.isPending ? (
        <LoadingRegion label="Loading requests">
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.total === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No open requests right now"
          body="New requests that match your roles and area will appear here."
        />
      ) : (
        <>
          <DataTable caption="Open requests" columns={columns} rows={query.data.items} rowKey={(r) => r.id} />
          <Pagination label="Requests" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </WorkspacePage>
  );
}
