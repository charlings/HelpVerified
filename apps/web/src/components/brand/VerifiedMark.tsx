import { Check } from "lucide-react";

/** The yellow "verified" check motif. Yellow means verified and is used for nothing else. */
export function VerifiedMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-10 items-center justify-center rounded-full bg-(image:--gradient-verified) text-navy-900"
    >
      <Check className="size-5" strokeWidth={3} />
    </span>
  );
}
