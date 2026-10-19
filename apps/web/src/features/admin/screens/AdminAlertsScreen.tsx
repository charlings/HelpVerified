"use client";

import { BellRing } from "lucide-react";
import { useState } from "react";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { messageForError } from "@/lib/error-messages";
import { formatDateTime } from "@/lib/format";
import { ResolveAlertDialog } from "../components/ResolveAlertDialog";
import { useAcknowledgeAlert, useAdminAlerts } from "../hooks";
import { alertKind, alertState } from "../status";
import type { AdminAlert, AlertFilter } from "../types";

const filters: Record<AlertFilter, string> = { open: "Unresolved", resolved: "Resolved", all: "All" };

function AlertCard({
  alert,
  acknowledging,
  onAcknowledge,
  onResolve,
}: {
  alert: AdminAlert;
  acknowledging: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
}) {
  const kind = alertKind[alert.kind];
  const state = alertState[alert.state];
  return (
    <Card className="grid gap-2 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-navy-900">{kind.title}</h2>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <p className="text-sm text-slate-700">{kind.guidance}</p>
      <dl className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="inline">Opened: </dt>
          <dd className="inline">
            <time dateTime={alert.opened_at}>{formatDateTime(alert.opened_at)}</time>
          </dd>
        </div>
        {alert.payment_reference ? (
          <div>
            <dt className="inline">Paystack reference: </dt>
            <dd className="inline font-mono break-all">{alert.payment_reference}</dd>
          </div>
        ) : null}
        {alert.acknowledged_by ? (
          <div>
            <dt className="inline">Acknowledged by: </dt>
            <dd className="inline">{alert.acknowledged_by}</dd>
          </div>
        ) : null}
        {alert.resolved_at ? (
          <div className="sm:col-span-2">
            <dt className="inline">Resolved by {alert.resolved_by ?? "System"}: </dt>
            <dd className="inline">{alert.resolution_note ?? "—"}</dd>
          </div>
        ) : null}
      </dl>
      {alert.state !== "resolved" ? (
        <div className="flex flex-wrap justify-end gap-2">
          {alert.state === "open" ? (
            <Button variant="secondary" shape="app" loading={acknowledging} onClick={onAcknowledge}>
              Acknowledge
            </Button>
          ) : null}
          <Button shape="app" onClick={onResolve}>
            Resolve
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Persistent payment alerts (ADR 0017). Refunds are made in the Paystack dashboard, never from here. */
export function AdminAlertsScreen() {
  const [state, setState] = useState<AlertFilter>("open");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<AdminAlert | null>(null);
  const query = useAdminAlerts(state, page);
  const acknowledge = useAcknowledgeAlert();

  return (
    <WorkspacePage>
      <PageHeader
        title="Alerts"
        description="Payment problems that need an admin. An alert stays here until it's resolved; acknowledging only shows someone is on it."
      />
      <div className="mb-4 grid max-w-xs gap-1.5">
        <Label htmlFor="alert-state">Show</Label>
        <Select
          id="alert-state"
          shape="app"
          value={state}
          onChange={(e) => {
            setState(e.target.value as AlertFilter);
            setPage(1);
          }}
        >
          {(Object.keys(filters) as AlertFilter[]).map((f) => (
            <option key={f} value={f}>
              {filters[f]}
            </option>
          ))}
        </Select>
      </div>
      {acknowledge.isError ? (
        <div className="mb-4">
          <Alert tone="danger">{messageForError(acknowledge.error)}</Alert>
        </div>
      ) : null}

      {query.isPending ? (
        <LoadingRegion label="Loading alerts">
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.total === 0 ? (
        <EmptyState icon={BellRing} title={state === "open" ? "Nothing needs attention" : "No alerts here"} />
      ) : (
        <>
          <ul className="grid gap-3" aria-label="Alerts">
            {query.data.items.map((a) => (
              <li key={a.id}>
                <AlertCard
                  alert={a}
                  acknowledging={acknowledge.isPending && acknowledge.variables === a.id}
                  onAcknowledge={() => acknowledge.mutate(a.id)}
                  onResolve={() => setResolving(a)}
                />
              </li>
            ))}
          </ul>
          <Pagination label="Alerts" page={page} pageSize={20} total={query.data.total} onPageChange={setPage} />
        </>
      )}
      <ResolveAlertDialog alert={resolving} onClose={() => setResolving(null)} />
    </WorkspacePage>
  );
}
