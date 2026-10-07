"use client";

import { Handshake } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { formatDate } from "@/lib/format";
import type { PlacementStatus } from "@/types/domain";
import { usePlacements } from "../hooks";
import { placementStatus } from "../status";
import type { PlacementSummary } from "../types";
import { textLink } from "@/components/ui/link-styles";

type Viewer = "agency_admin" | "family" | "super_admin";

const detailHref: Record<Viewer, (id: string) => string> = {
  agency_admin: routes.agency.placement,
  family: routes.family.placement,
  super_admin: routes.admin.placement,
};

const emptyBody: Record<Viewer, string> = {
  agency_admin: "Placements appear here once a family accepts one of your proposals.",
  family: "Placements appear here once you accept a proposal.",
  super_admin: "Placements appear here once a family accepts a proposal.",
};

function trialText(p: PlacementSummary) {
  if (p.status === "pending_payment") return "Not started";
  if (!p.trial_starts_on || !p.trial_ends_on) return "—";
  return `${formatDate(p.trial_starts_on)} – ${formatDate(p.trial_ends_on)}`;
}

export function PlacementsListScreen({ viewer }: { viewer: Viewer }) {
  const [status, setStatus] = useState<PlacementStatus | undefined>();
  const [page, setPage] = useState(1);
  const query = usePlacements({ status, page });

  const columns: Column<PlacementSummary>[] = [
    {
      key: "worker",
      header: "Worker",
      primary: true,
      cell: (p) => (
        <Link href={detailHref[viewer](p.id)} className={textLink}>
          {p.worker.full_name}
        </Link>
      ),
    },
    { key: "role", header: "Role", cell: (p) => services[p.worker.role].name },
    ...(viewer !== "family" ? [{ key: "family", header: "Family", cell: (p: PlacementSummary) => p.family.name }] : []),
    ...(viewer !== "agency_admin"
      ? [{ key: "agency", header: "Agency", cell: (p: PlacementSummary) => p.agency.name }]
      : []),
    {
      key: "status",
      header: "Status",
      cell: (p) => <Badge tone={placementStatus[p.status].tone}>{placementStatus[p.status].label}</Badge>,
    },
    { key: "trial", header: "Trial", cell: trialText },
  ];

  return (
    <WorkspacePage>
      <PageHeader title="Placements" description="Every placement from payment through trial to confirmation." />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="placement-status">Status</Label>
          <Select
            id="placement-status"
            shape="app"
            value={status ?? ""}
            onChange={(e) => {
              setStatus((e.target.value || undefined) as PlacementStatus | undefined);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(Object.keys(placementStatus) as PlacementStatus[]).map((s) => (
              <option key={s} value={s}>
                {placementStatus[s].label}
              </option>
            ))}
          </Select>
        </div>
        {status ? (
          <Button variant="ghost" shape="app" onClick={() => setStatus(undefined)}>
            Clear filter
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <LoadingRegion label="Loading placements">
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
          icon={Handshake}
          title={status ? "No placements with this status" : "No placements yet"}
          body={status ? undefined : emptyBody[viewer]}
        />
      ) : (
        <>
          <DataTable caption="Placements" columns={columns} rows={query.data.items} rowKey={(p) => p.id} />
          <Pagination label="Placements" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </WorkspacePage>
  );
}
