import { formatDateTime } from "@/lib/format";
import type { PlacementStatus } from "@/types/domain";
import { eventActor } from "../status";
import type { PlacementEvent } from "../types";

const eventLabel: Record<PlacementStatus, string> = {
  pending_payment: "Proposal accepted. Waiting for the placement fee",
  trial: "Placement fee paid. Trial started",
  confirmed: "Placement confirmed",
  ended: "Placement ended",
  cancelled: "Placement cancelled",
};

/** Every state change, oldest first (placement_events). */
export function PlacementTimeline({ events }: { events: PlacementEvent[] }) {
  return (
    <ol className="relative grid gap-5 border-l-2 border-border pl-6">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-white bg-blue-600"
          />
          <p className="font-semibold text-navy-900">{eventLabel[e.to]}</p>
          <p className="text-sm text-slate-600">
            <time dateTime={e.at}>{formatDateTime(e.at)}</time> · {eventActor[e.actor]}
          </p>
          {e.reason ? <p className="mt-1 text-sm">&ldquo;{e.reason}&rdquo;</p> : null}
        </li>
      ))}
    </ol>
  );
}
