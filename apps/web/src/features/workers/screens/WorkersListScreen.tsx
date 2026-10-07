"use client";

import { Plus, SearchX, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { routes, serviceSlugs } from "@/config/routes";
import { services } from "@/content/services";
import type { ListingStatus, WorkerRole } from "@/types/domain";
import { useWorkers } from "../hooks";
import { availabilityLabel, listingStatus } from "../status";
import type { Worker, WorkerFilters } from "../types";
import { textLink } from "@/components/ui/link-styles";

const PAGE_SIZE = 20;
const listingStatuses = Object.keys(listingStatus) as ListingStatus[];

const columns: Column<Worker>[] = [
  {
    key: "name",
    header: "Worker",
    primary: true,
    cell: (w) => (
      <span className="flex items-center gap-3">
        <Avatar name={w.full_name} size="sm" />
        <Link href={routes.agency.worker(w.id)} className={textLink}>
          {w.full_name}
        </Link>
      </span>
    ),
  },
  { key: "role", header: "Role", cell: (w) => services[w.role].name },
  { key: "checks", header: "Checks", cell: (w) => `${w.verified_count} of 4 verified` },
  {
    key: "listing",
    header: "Listing",
    cell: (w) => <Badge tone={listingStatus[w.listing_status].tone}>{listingStatus[w.listing_status].label}</Badge>,
  },
  { key: "availability", header: "Availability", cell: (w) => availabilityLabel(w) },
];

function readFilters(params: URLSearchParams): WorkerFilters {
  const role = params.get("role");
  const status = params.get("listing_status");
  return {
    role: (serviceSlugs as readonly string[]).includes(role ?? "") ? (role as WorkerRole) : undefined,
    listing_status: (listingStatuses as string[]).includes(status ?? "") ? (status as ListingStatus) : undefined,
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}

export function WorkersListScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = readFilters(params);
  const query = useWorkers(filters);
  const filtered = Boolean(filters.role || filters.listing_status);

  // Filters live in the URL so lists can be shared and survive a reload.
  function setFilters(next: WorkerFilters) {
    const search = new URLSearchParams();
    if (next.role) search.set("role", next.role);
    if (next.listing_status) search.set("listing_status", next.listing_status);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const addWorker = (
    <Link href={routes.agency.newWorker} className={buttonVariants({ shape: "app" })}>
      <Plus aria-hidden="true" className="size-4" />
      Add worker
    </Link>
  );

  return (
    <WorkspacePage>
      <PageHeader
        title="Workers"
        description="Everyone your agency represents, and where their checks stand."
        actions={addWorker}
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="filter-role">Role</Label>
          <Select
            id="filter-role"
            shape="app"
            value={filters.role ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, role: (e.target.value || undefined) as WorkerRole | undefined, page: 1 })
            }
          >
            <option value="">All roles</option>
            {serviceSlugs.map((s) => (
              <option key={s} value={s}>
                {services[s].plural}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-status">Listing</Label>
          <Select
            id="filter-status"
            shape="app"
            value={filters.listing_status ?? ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                listing_status: (e.target.value || undefined) as ListingStatus | undefined,
                page: 1,
              })
            }
          >
            <option value="">All statuses</option>
            {listingStatuses.map((s) => (
              <option key={s} value={s}>
                {listingStatus[s].label}
              </option>
            ))}
          </Select>
        </div>
        {filtered ? (
          <Button variant="ghost" shape="app" onClick={() => setFilters({})}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <LoadingRegion label="Loading workers">
          <div className="grid gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.total === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No workers match these filters"
            action={
              <Button variant="secondary" shape="app" onClick={() => setFilters({})}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No workers yet"
            body="Add your first worker, then complete their four checks to list them."
            action={addWorker}
          />
        )
      ) : (
        <>
          <DataTable caption="Workers" columns={columns} rows={query.data.items} rowKey={(w) => w.id} />
          <Pagination
            label="Workers"
            page={query.data.page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onPageChange={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}
    </WorkspacePage>
  );
}
