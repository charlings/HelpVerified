import Link from "next/link";
import { routes } from "@/config/routes";
import { formatDateTime } from "@/lib/format";
import { auditAction } from "../status";
import type { AuditEntry } from "../types";

export function auditEntityHref(entry: AuditEntry): string | null {
  const id = entry.entity_id;
  switch (entry.entity) {
    case "agency":
      return id ? routes.admin.agency(id) : null;
    case "worker":
      return id ? routes.admin.worker(id) : null;
    case "placement":
      return id ? routes.admin.placement(id) : null;
    case "document":
      return entry.worker_id ? routes.admin.worker(entry.worker_id) : null;
  }
}

/** A compact, readable list of audit entries (overview, agency history). The full log is a table. */
export function AuditList({ entries, linkEntities = true }: { entries: AuditEntry[]; linkEntities?: boolean }) {
  return (
    <ol className="grid gap-4">
      {entries.map((e) => {
        const href = linkEntities ? auditEntityHref(e) : null;
        return (
          <li key={e.id} className="border-l-2 border-border-strong pl-4">
            <p className="text-sm text-slate-600">
              <time dateTime={e.created_at}>{formatDateTime(e.created_at)}</time> · {e.actor?.name ?? "System"}
            </p>
            <p className="mt-0.5 font-medium text-navy-900">
              {auditAction[e.action]}:{" "}
              {href ? (
                <Link href={href} className="text-blue-600 hover:underline">
                  {e.entity_label}
                </Link>
              ) : (
                e.entity_label
              )}
            </p>
            {e.reason ? <p className="mt-0.5 text-sm">Reason: {e.reason}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
