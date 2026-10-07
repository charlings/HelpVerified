"use client";

import { Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { formatDate } from "@/lib/format";
import type { AgencyStatus, WorkerRole } from "@/types/domain";
import type { AgencyFilter } from "../api";
import { useAdminAgencies } from "../hooks";
import { agencyStatus } from "../status";
import type { AdminAgencySummary } from "../types";
import { textLink } from "@/components/ui/link-styles";

const columns: Column<AdminAgencySummary>[] = [
  {
    key: "name",
    header: "Agency",
    primary: true,
    cell: (a) => (
      <Link href={routes.admin.agency(a.id)} className={textLink}>
        {a.name}
      </Link>
    ),
  },
  { key: "cac", header: "CAC number", cell: (a) => a.cac_number },
  { key: "area", header: "Area", cell: (a) => `${a.lga}, ${a.state}` },
  {
    key: "roles",
    header: "Roles",
    cell: (a) => a.roles_offered.map((r) => services[r as WorkerRole].plural).join(", "),
  },
  { key: "workers", header: "Workers", cell: (a) => String(a.workers_total) },
  {
    key: "status",
    header: "Status",
    cell: (a) => <Badge tone={agencyStatus[a.status].tone}>{agencyStatus[a.status].label}</Badge>,
  },
  { key: "applied", header: "Applied", cell: (a) => formatDate(a.created_at.slice(0, 10)) },
];

const filters = ["all", ...(Object.keys(agencyStatus) as AgencyStatus[])] as const;

export function AdminAgenciesScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("status");
  const status: AgencyFilter = filters.includes(fromUrl as AgencyFilter) ? (fromUrl as AgencyFilter) : "all";
  const [page, setPage] = useState(1);
  const query = useAdminAgencies(status, page);

  return (
    <WorkspacePage>
      <PageHeader title="Agencies" description="Review applications and keep registered agencies in good standing." />
      <div className="mb-4 grid max-w-xs gap-1.5">
        <Label htmlFor="agency-status">Status</Label>
        <Select
          id="agency-status"
          shape="app"
          value={status}
          onChange={(e) => {
            setPage(1);
            const next = e.target.value;
            router.replace(next === "all" ? pathname : `${pathname}?status=${next}`);
          }}
        >
          <option value="all">All agencies</option>
          {(Object.keys(agencyStatus) as AgencyStatus[]).map((s) => (
            <option key={s} value={s}>
              {agencyStatus[s].label}
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <LoadingRegion label="Loading agencies">
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
          icon={Building2}
          title={status === "pending" ? "No agencies awaiting approval" : "No agencies with this status"}
          body={status === "pending" ? "New applications appear here." : undefined}
        />
      ) : (
        <>
          <DataTable caption="Agencies" columns={columns} rows={query.data.items} rowKey={(a) => a.id} />
          <Pagination label="Agencies" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </WorkspacePage>
  );
}
