import { outstandingChecks } from "@/features/verification";
import type { Worker } from "./types";

export type ListingDecision = { canList: true } | { canList: false; reason: string };

/**
 * Mirrors the listing gate for the button state only. The API (and the database trigger) are the
 * authority; this just explains *why* the button is disabled before anyone clicks it.
 */
export function listingDecision(worker: Worker, agencyActive: boolean): ListingDecision {
  if (worker.listing_status === "suspended") {
    return { canList: false, reason: "This worker is suspended by HelpVerified." };
  }
  const outstanding = outstandingChecks(worker.verification);
  if (outstanding.length > 0) {
    const noun = outstanding.length === 1 ? "check" : "checks";
    return { canList: false, reason: `${outstanding.length} ${noun} still to verify: ${outstanding.join(", ")}.` };
  }
  if (!agencyActive) {
    return { canList: false, reason: "Your agency needs to be approved and subscribed before you can list workers." };
  }
  return { canList: true };
}
