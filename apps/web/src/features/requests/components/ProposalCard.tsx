import Link from "next/link";
import { useId } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { WorkerBadges } from "@/features/workers";
import { proposalStatus } from "../status";
import type { FamilyProposal } from "../types";

type ProposalCardProps = {
  proposal: FamilyProposal;
  /** The request is open, so pending proposals can be acted on. */
  actionable: boolean;
  onAccept: () => void;
  onDecline: () => void;
  declining: boolean;
};

export function ProposalCard({ proposal, actionable, onAccept, onDecline, declining }: ProposalCardProps) {
  const headingId = useId();
  const w = proposal.worker;
  const status = proposalStatus[proposal.status];
  const canAct = actionable && proposal.status === "pending";
  const allVerified = w.badges.length === 4;

  return (
    <article aria-labelledby={headingId} className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={w.first_name} />
          <div>
            <h3 id={headingId} className="text-lg">
              {w.first_name}
            </h3>
            <p className="text-sm">
              {w.years_experience} years&apos; experience · {w.languages.join(", ")} · from {w.agency.name}
            </p>
          </div>
        </div>
        {proposal.status !== "pending" ? <Badge tone={status.tone}>{status.label}</Badge> : null}
      </div>

      <div className="mt-4">
        <WorkerBadges badges={w.badges} />
      </div>
      {proposal.note ? <p className="mt-3 text-sm">&ldquo;{proposal.note}&rdquo;</p> : null}
      {canAct && !w.available ? (
        <p className="mt-3 text-sm font-medium text-warning-700">This worker has been placed with another family.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={routes.family.worker(w.id)}
          className="inline-flex h-(--control-h-md) items-center rounded-md px-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          aria-label={`View ${w.first_name}'s profile`}
        >
          View profile
        </Link>
        {canAct ? (
          <>
            <Button
              shape="app"
              onClick={onAccept}
              disabled={!w.available || !allVerified}
              aria-label={`Accept ${w.first_name}`}
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              shape="app"
              loading={declining}
              onClick={onDecline}
              aria-label={`Decline ${w.first_name}`}
            >
              Decline
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
