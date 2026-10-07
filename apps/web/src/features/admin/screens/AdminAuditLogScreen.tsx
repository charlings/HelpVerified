"use client";

import { ScrollText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { formatDateTime } from "@/lib/format";
import { auditEntityHref } from "../components/AuditList";
import { useAuditLog } from "../hooks";
import { auditAction } from "../status";
import type { AuditAction, AuditEntry } from "../types";
import { textLink } from "@/components/ui/link-styles";

const roleLabel = { super_admin: "Admin", agency_admin: "Agency", family: "Family" } as const;

const columns: Column<AuditEntry>[] = [
  {
    key: "time",
    header: "When",
    primary: true,
    cell: (e) => <time dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>,
  },
  {
    key: "actor",
    header: "Who",
    cell: (e) => (e.actor ? `${e.actor.name} (${roleLabel[e.actor.role]})` : "System"),
  },
  { key: "action", header: "Action", cell: (e) => auditAction[e.action] },
  {
    key: "entity",
    header: "Record",
    cell: (e) => {
      const href = auditEntityHref(e);
      return href ? (
        <Link href={href} className={textLink}>
          {e.entity_label}
        </Link>
      ) : (
        e.entity_label
      );
    },
  },
  { key: "reason", header: "Reason", cell: (e) => e.reason ?? "—" },
];

const actions = Object.keys(auditAction) as AuditAction[];

export function AdminAuditLogScreen() {
  const [action, setAction] = useState<AuditAction | undefined>();
  const [page, setPage] = useState(1);
  const query = useAuditLog(action, page);

  return (
    <WorkspacePage>
      <PageHeader
        title="Audit log"
        description="Admin decisions and every view of a verification document, newest first. Entries can't be edited or deleted."
      />
      <div className="mb-4 grid max-w-xs gap-1.5">
        <Label htmlFor="audit-action">Action</Label>
        <Select
          id="audit-action"
          shape="app"
          value={action ?? ""}
          onChange={(e) => {
            setAction((e.target.value || undefined) as AuditAction | undefined);
            setPage(1);
          }}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {auditAction[a]}
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <LoadingRegion label="Loading audit log">
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.total === 0 ? (
        <EmptyState icon={ScrollText} title={action ? "Nothing recorded for this action" : "Nothing recorded yet"} />
      ) : (
        <>
          <DataTable caption="Audit log" columns={columns} rows={query.data.items} rowKey={(e) => e.id} />
          <Pagination label="Audit log" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </WorkspacePage>
  );
}
