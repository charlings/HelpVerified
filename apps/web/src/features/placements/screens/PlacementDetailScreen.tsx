"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/feedback/Toast";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { business } from "@/config/business";
import { routes } from "@/config/routes";
import { services } from "@/content/services";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format";
import { PlacementTimeline } from "../components/PlacementTimeline";
import { usePlacement, usePlacementActions } from "../hooks";
import type { PlacementAction } from "../state-machine";
import { endReason, placementAction, placementStatus } from "../status";
import type { Placement } from "../types";
import { textLink } from "@/components/ui/link-styles";

type Viewer = "agency_admin" | "family" | "super_admin";

const listHref: Record<Viewer, string> = {
  agency_admin: routes.agency.placements,
  family: routes.family.placements,
  super_admin: routes.admin.placements,
};

function TrialCountdown({ placement }: { placement: Placement }) {
  if (placement.status !== "trial" || !placement.trial_ends_on) return null;
  const days = daysUntil(placement.trial_ends_on);
  const when = formatDate(placement.trial_ends_on);
  const text =
    days > 1
      ? `Trial ends in ${days} days (${when}).`
      : days === 1
        ? `Trial ends tomorrow (${when}).`
        : days === 0
          ? "Trial ends today."
          : `Trial ended on ${when}.`;
  return (
    <Alert tone="info" title="Trial in progress">
      {text}
    </Alert>
  );
}

/**
 * Placement detail for either party. Action buttons come only from the API's `allowed_actions`
 * (computed server-side from the state machine and the viewer's role), labelled via status.ts.
 */
export function PlacementDetailScreen({ placementId, viewer }: { placementId: string; viewer: Viewer }) {
  const query = usePlacement(placementId);
  const actions = usePlacementActions(placementId);
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<PlacementAction | null>(null);
  const back = { label: "All placements", href: listHref[viewer] };

  if (query.isPending) {
    return (
      <WorkspacePage>
        <PageHeader title="Placement" back={back} />
        <LoadingRegion label="Loading placement">
          <Skeleton className="h-64" />
        </LoadingRegion>
      </WorkspacePage>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.code === "NOT_FOUND";
    return (
      <WorkspacePage>
        <PageHeader title={notFound ? "Placement not found" : "Placement"} back={back} />
        <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />
      </WorkspacePage>
    );
  }

  const p = query.data;
  const status = placementStatus[p.status];
  const counterpart = viewer === "family" ? p.agency.name : `the ${p.family.name}`;
  // Admins see both parties: the family in the title, the agency under it.
  const subtitle =
    viewer === "super_admin" ? `${services[p.worker.role].name} · ${p.agency.name}` : services[p.worker.role].name;

  function resumePayment() {
    actions.pay.mutate(undefined, {
      onSuccess: ({ authorization_url }) => {
        if (authorization_url.startsWith("/")) router.push(authorization_url);
        else window.location.assign(authorization_url);
      },
      onError: (error) => toast.error(messageForError(error)),
    });
  }

  const handlers: Record<PlacementAction, () => void> = {
    pay: resumePayment,
    cancel: () => setOpen("cancel"),
    confirm: () => setOpen("confirm"),
    request_replacement: () => setOpen("request_replacement"),
    end: () => setOpen("end"),
  };
  const close = () => setOpen(null);

  return (
    <WorkspacePage>
      <PageHeader
        title={`${p.worker.full_name} with ${counterpart}`}
        description={subtitle}
        back={back}
        actions={
          p.allowed_actions.length > 0
            ? p.allowed_actions.map((a) => (
                <Button
                  key={a}
                  variant={placementAction[a].variant}
                  shape="app"
                  loading={a === "pay" && actions.pay.isPending}
                  onClick={handlers[a]}
                >
                  {placementAction[a].label}
                </Button>
              ))
            : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-6">
          {p.status === "pending_payment" && p.hold_expires_at ? (
            <Alert tone="warning" title={viewer === "family" ? "Payment needed" : "Waiting for the family's payment"}>
              {viewer === "family"
                ? `${p.worker.full_name} is held for you until ${formatDateTime(p.hold_expires_at)}. Pay the placement fee to start the trial.`
                : `The worker is held until ${formatDateTime(p.hold_expires_at)}. If the family doesn't pay by then, the placement is cancelled automatically.`}
            </Alert>
          ) : null}
          <TrialCountdown placement={p} />
          <section
            aria-labelledby="summary-heading"
            className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="summary-heading" className="text-xl">
                Summary
              </h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-2 text-sm">{status.description}</p>
            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                ["Family", p.family.name],
                ["Agency", p.agency.name],
                [
                  "Trial",
                  p.trial_starts_on && p.trial_ends_on
                    ? `${formatDate(p.trial_starts_on)} – ${formatDate(p.trial_ends_on)}`
                    : "Not started",
                ],
                ["Confirmed", p.confirmed_at ? formatDateTime(p.confirmed_at) : "Not yet"],
                ...(p.status === "pending_payment" && p.hold_expires_at
                  ? [["Payment due by", formatDateTime(p.hold_expires_at)]]
                  : []),
                ...(p.ended_at ? [["Ended", formatDateTime(p.ended_at)]] : []),
                ...(p.end_reason ? [["Why it ended", endReason[p.end_reason]]] : []),
                ["Replacements used", `${p.replacements_used} of ${business.freeReplacements} free`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
            {viewer === "family" && p.end_reason === "replaced" ? (
              <p className="mt-4 text-sm">
                <Link href={routes.family.requests} className={textLink}>
                  See your replacement request
                </Link>
              </p>
            ) : null}
          </section>
        </div>

        <section
          aria-labelledby="timeline-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="timeline-heading" className="mb-4 text-xl">
            Timeline
          </h2>
          <PlacementTimeline events={p.events} />
        </section>
      </div>

      <ReasonDialog
        open={open === "end"}
        onOpenChange={(o) => !o && close()}
        title={placementAction.end.confirmTitle!}
        description={placementAction.end.confirmText}
        hint="Both the family and the agency will see this."
        missingReason="Say why the placement is ending."
        submitLabel={placementAction.end.label}
        cancelLabel="Keep placement"
        onSubmit={(reason) => actions.end.mutateAsync(reason)}
      />
      <ReasonDialog
        open={open === "cancel"}
        onOpenChange={(o) => !o && close()}
        title="Cancel this placement?"
        description="The worker will be released and your request opens again for other proposals. You haven't been charged."
        hint="The agency will see this."
        missingReason="Say why you're cancelling."
        submitLabel="Cancel placement"
        cancelLabel="Keep it"
        onSubmit={(reason) => actions.cancel.mutateAsync(reason)}
      />
      <ReasonDialog
        open={open === "request_replacement"}
        onOpenChange={(o) => !o && close()}
        title="Request a replacement?"
        description={`This placement ends and a new request opens with the same details, so agencies can propose someone else. Your placement fee covers ${business.freeReplacements === 1 ? "one replacement" : `${business.freeReplacements} replacements`}.`}
        hint="What didn't work? The agency sees this, so they can propose someone better suited."
        missingReason="Say what didn't work, so agencies can propose someone better suited."
        submitLabel="Request replacement"
        cancelLabel="Not now"
        onSubmit={async (reason) => {
          const result = await actions.replacement.mutateAsync(reason);
          router.push(routes.family.request(result.new_request.id));
        }}
      />
      <Dialog
        open={open === "confirm"}
        onOpenChange={(o) => !o && close()}
        title="Confirm this placement?"
        description={`Let ${p.agency.name} know the trial went well and ${p.worker.full_name} is staying. You can still ask for a replacement within ${business.replacementWindowDays} days.`}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={close}>
            Not yet
          </Button>
          <Button
            shape="app"
            loading={actions.confirm.isPending}
            onClick={() =>
              actions.confirm.mutate(undefined, {
                onSuccess: close,
                onError: (error) => toast.error(messageForError(error)),
              })
            }
          >
            Confirm placement
          </Button>
        </div>
      </Dialog>
    </WorkspacePage>
  );
}
