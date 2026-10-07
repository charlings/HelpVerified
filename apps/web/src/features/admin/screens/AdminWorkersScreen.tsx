"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
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
import { availabilityLabel, listingStatus } from "@/features/workers";
import type { ListingStatus, WorkerRole } from "@/types/domain";
import { adminApi } from "../api";
import { useAdminWorkers } from "../hooks";
import type { AdminWorker } from "../types";
import { textLink } from "@/components/ui/link-styles";

const columns: Column<AdminWorker>[] = [
  {
    key: "name",
    header: "Worker",
    primary: true,
    cell: (w) => (
      <Link href={routes.admin.worker(w.id)} className={textLink}>
        {w.full_name}
      </Link>
    ),
  },
  { key: "agency", header: "Agency", cell: (w) => w.agency.name },
  { key: "role", header: "Role", cell: (w) => services[w.role].name },
  { key: "checks", header: "Checks", cell: (w) => `${w.verified_count} of 4` },
  {
    key: "listing",
    header: "Listing",
    cell: (w) => <Badge tone={listingStatus[w.listing_status].tone}>{listingStatus[w.listing_status].label}</Badge>,
  },
  { key: "availability", header: "Availability", cell: (w) => availabilityLabel(w) },
];

const roles = Object.keys(services) as WorkerRole[];
const listings = Object.keys(listingStatus) as ListingStatus[];

export function AdminWorkersScreen() {
  const [agencyId, setAgencyId] = useState<string>("");
  const [role, setRole] = useState<WorkerRole | "">("");
  const [listing, setListing] = useState<ListingStatus | "">("");
  const [page, setPage] = useState(1);
  const query = useAdminWorkers({
    page,
    ...(agencyId ? { agency_id: agencyId } : {}),
    ...(role ? { role } : {}),
    ...(listing ? { listing_status: listing } : {}),
  });
  // Agency names for the filter; a separate small query so the table doesn't wait for it.
  const agencies = useQuery({
    queryKey: ["admin", "agencies", "all", "options"],
    queryFn: () => adminApi.agencies("all", 1),
  });
  const filtered = Boolean(agencyId || role || listing);

  function update<T>(set: (v: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  return (
    <WorkspacePage>
      <PageHeader
        title="Workers"
        description="Every worker on HelpVerified, across all agencies, and the state of their checks."
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="worker-agency">Agency</Label>
          <Select id="worker-agency" shape="app" value={agencyId} onChange={(e) => update(setAgencyId)(e.target.value)}>
            <option value="">All agencies</option>
            {agencies.data?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="worker-role">Role</Label>
          <Select
            id="worker-role"
            shape="app"
            value={role}
            onChange={(e) => update(setRole)(e.target.value as WorkerRole | "")}
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {services[r].plural}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="worker-listing">Listing</Label>
          <Select
            id="worker-listing"
            shape="app"
            value={listing}
            onChange={(e) => update(setListing)(e.target.value as ListingStatus | "")}
          >
            <option value="">Any listing status</option>
            {listings.map((s) => (
              <option key={s} value={s}>
                {listingStatus[s].label}
              </option>
            ))}
          </Select>
        </div>
        {filtered ? (
          <Button
            variant="ghost"
            shape="app"
            onClick={() => {
              setAgencyId("");
              setRole("");
              setListing("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <LoadingRegion label="Loading workers">
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
          icon={Users}
          title={filtered ? "No workers match these filters" : "No workers yet"}
          body={filtered ? undefined : "Workers appear here as agencies add them."}
        />
      ) : (
        <>
          <DataTable caption="Workers" columns={columns} rows={query.data.items} rowKey={(w) => w.id} />
          <Pagination label="Workers" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </WorkspacePage>
  );
}
