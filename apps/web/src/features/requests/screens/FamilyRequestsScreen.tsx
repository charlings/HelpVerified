"use client";

import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { formatDate } from "@/lib/format";
import { useFamilyRequests } from "../family-hooks";
import { requestStatus } from "../status";
import type { FamilyRequest } from "../types";
import { textLink } from "@/components/ui/link-styles";

function proposalsText(r: FamilyRequest) {
  if (r.status !== "open") return r.proposals_count === 0 ? "—" : `${r.proposals_count}`;
  if (r.pending_proposals === 0) return "None yet";
  return `${r.pending_proposals} to review`;
}

const columns: Column<FamilyRequest>[] = [
  {
    key: "title",
    header: "Request",
    primary: true,
    cell: (r) => (
      <Link href={routes.family.request(r.id)} className={textLink}>
        {r.title}
      </Link>
    ),
  },
  { key: "role", header: "Role", cell: (r) => services[r.role].name },
  { key: "start", header: "Starts", cell: (r) => formatDate(r.start_date) },
  {
    key: "status",
    header: "Status",
    cell: (r) => <Badge tone={requestStatus[r.status].tone}>{requestStatus[r.status].label}</Badge>,
  },
  { key: "proposals", header: "Proposals", cell: proposalsText },
];

export function FamilyRequestsScreen() {
  const [page, setPage] = useState(1);
  const query = useFamilyRequests(page);
  const newRequest = (
    <Link href={routes.family.newRequest} className={buttonVariants({ shape: "app" })}>
      <Plus aria-hidden="true" className="size-4" />
      Post a request
    </Link>
  );

  return (
    <WorkspacePage>
      <PageHeader
        title="Requests"
        description="What you've asked for and the workers agencies have proposed."
        actions={newRequest}
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
          icon={ClipboardList}
          title="No requests yet"
          body="Post a request and registered agencies near you will propose workers who have passed all four checks."
          action={newRequest}
        />
      ) : (
        <>
          <DataTable caption="Your requests" columns={columns} rows={query.data.items} rowKey={(r) => r.id} />
          <Pagination label="Requests" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </WorkspacePage>
  );
}
