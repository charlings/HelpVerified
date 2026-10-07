"use client";

import { FileText, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import {
  DocumentViewer,
  verificationKindInfo,
  verificationStatus,
  type VerificationDocument,
  type VerificationItem,
} from "@/features/verification";
import { availabilityLabel, listingStatus } from "@/features/workers";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAdminWorker, useFlagCheck } from "../hooks";
import { textLink } from "@/components/ui/link-styles";

/** One check, read-only for admins: status, details, evidence (viewing is logged), and Flag when verified. */
function AdminCheck({
  item,
  onView,
  onFlag,
}: {
  item: VerificationItem;
  onView: (doc: VerificationDocument, title: string) => void;
  onFlag: () => void;
}) {
  const info = verificationKindInfo[item.kind];
  const status = verificationStatus[item.status];
  const headingId = useId();
  const details = info.fields.filter((f) => item.details[f.name]);

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={headingId} className="text-xl">
          {info.label}
        </h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-2 text-sm">
        {item.status === "verified" && item.verified_at
          ? `Verified ${formatDate(item.verified_at.slice(0, 10))}.`
          : status.description}
        {item.status === "verified" && item.expires_at
          ? ` Re-check due ${formatDate(item.expires_at.slice(0, 10))}.`
          : ""}
      </p>
      {item.flag_reason && item.status !== "verified" ? (
        <Alert
          tone="warning"
          title={`Flagged ${item.flagged_at ? formatDateTime(item.flagged_at) : ""}`}
          className="mt-3"
        >
          {item.flag_reason}
        </Alert>
      ) : null}
      {item.status === "rejected" && item.rejection_reason ? (
        <Alert tone="danger" title="Rejected by the agency" className="mt-3">
          {item.rejection_reason}
        </Alert>
      ) : null}

      {details.length > 0 ? (
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {details.map((f) => (
            <div key={f.name}>
              <dt className="text-sm text-slate-600">{f.label}</dt>
              <dd className="mt-0.5 font-medium break-words text-navy-900">{item.details[f.name]}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-4">
        <h4 className="text-base font-semibold text-navy-900">Evidence</h4>
        {item.documents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No documents.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {item.documents.map((doc, index) => {
              const Icon = doc.format === "pdf" ? FileText : ImageIcon;
              const name = `${info.label} document ${index + 1}`;
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <Icon aria-hidden="true" className="size-5 text-slate-600" />
                  <span className="flex-1 text-navy-900">
                    {name} · {doc.format.toUpperCase()}
                  </span>
                  <Button variant="ghost" shape="app" onClick={() => onView(doc, name)} aria-label={`View ${name}`}>
                    View
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {item.status === "verified" ? (
        <div className="mt-5 border-t border-border pt-4">
          <Button variant="secondary" shape="app" onClick={onFlag} aria-label={`Flag ${info.label.toLowerCase()}`}>
            Flag for re-check
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function AdminWorkerDetailScreen({ workerId }: { workerId: string }) {
  const query = useAdminWorker(workerId);
  const flag = useFlagCheck(workerId);
  const [viewing, setViewing] = useState<{ doc: VerificationDocument; title: string } | null>(null);
  const [flagging, setFlagging] = useState<VerificationItem | null>(null);
  const back = { label: "All workers", href: routes.admin.workers };

  if (query.isPending) {
    return (
      <WorkspacePage>
        <PageHeader title="Worker" back={back} />
        <LoadingRegion label="Loading worker">
          <Skeleton className="h-64" />
        </LoadingRegion>
      </WorkspacePage>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.code === "NOT_FOUND";
    return (
      <WorkspacePage>
        <PageHeader title={notFound ? "Worker not found" : "Worker"} back={back} />
        <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />
      </WorkspacePage>
    );
  }

  const w = query.data;
  const listing = listingStatus[w.listing_status];
  const flagInfo = flagging ? verificationKindInfo[flagging.kind] : null;

  return (
    <WorkspacePage>
      <PageHeader title={w.full_name} description={`${services[w.role].name} · ${w.agency.name}`} back={back} />

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section
          aria-labelledby="summary-heading"
          className="h-fit rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="summary-heading" className="text-xl">
            Summary
          </h2>
          <dl className="mt-4 grid gap-y-3">
            <div>
              <dt className="text-sm text-slate-600">Listing</dt>
              <dd className="mt-1">
                <Badge tone={listing.tone}>{listing.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Checks</dt>
              <dd className="mt-0.5 font-medium text-navy-900">{w.verified_count} of 4 verified</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Availability</dt>
              <dd className="mt-0.5 font-medium text-navy-900">
                {w.active_placement ? (
                  <Link href={routes.admin.placement(w.active_placement.id)} className={textLink}>
                    {availabilityLabel(w)}
                  </Link>
                ) : (
                  availabilityLabel(w)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Agency</dt>
              <dd className="mt-0.5 font-medium">
                <Link href={routes.admin.agency(w.agency.id)} className={textLink}>
                  {w.agency.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">NIN</dt>
              <dd className="mt-0.5 font-medium text-navy-900">Ending {w.nin_last4}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="checks-heading" className="grid content-start gap-4">
          <div>
            <h2 id="checks-heading" className="text-xl">
              Checks
            </h2>
            <p className="mt-1 text-sm">
              Every document you open is recorded in the audit log. Flagging a verified check sends it back to the
              agency and removes the worker from listings; a running placement continues.
            </p>
          </div>
          {w.checks.map((item) => (
            <AdminCheck
              key={item.kind}
              item={item}
              onView={(doc, title) => setViewing({ doc, title })}
              onFlag={() => setFlagging(item)}
            />
          ))}
        </section>
      </div>

      <DocumentViewer document={viewing?.doc ?? null} title={viewing?.title ?? ""} onClose={() => setViewing(null)} />
      {flagging && flagInfo ? (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setFlagging(null)}
          title={`Flag ${w.full_name}'s ${flagInfo.label.toLowerCase()} check?`}
          description="The check goes back to the agency for review and the worker is removed from listings until it's verified again. A running placement continues."
          hint="What needs re-checking? The agency sees this."
          missingReason="Say what needs re-checking. The agency will see it."
          submitLabel="Flag check"
          cancelLabel="Cancel"
          onSubmit={(reason) => flag.mutateAsync({ kind: flagging.kind, reason })}
        />
      ) : null}
    </WorkspacePage>
  );
}
