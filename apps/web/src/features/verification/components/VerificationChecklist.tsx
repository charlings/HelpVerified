"use client";

import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { useVerification } from "../hooks";
import { CheckCard } from "./CheckCard";

/** The four checks for one worker, with overall progress. */
export function VerificationChecklist({ workerId }: { workerId: string }) {
  const query = useVerification(workerId);

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading checks">
        <div className="grid gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </LoadingRegion>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const items = query.data;
  const verified = items.filter((i) => i.status === "verified").length;
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-semibold text-navy-900" id="checks-progress-label">
          {verified} of 4 checks verified
        </p>
        <div
          role="progressbar"
          aria-labelledby="checks-progress-label"
          aria-valuenow={verified}
          aria-valuemin={0}
          aria-valuemax={4}
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        >
          <div className="h-full bg-(image:--gradient-verified)" style={{ width: `${(verified / 4) * 100}%` }} />
        </div>
      </div>
      {items.map((item) => (
        // Keyed by status too, so the details form resets when the server changes the check.
        <CheckCard key={`${item.kind}-${item.status}`} workerId={workerId} item={item} />
      ))}
    </div>
  );
}
