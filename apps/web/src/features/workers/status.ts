import type { BadgeTone } from "@/components/ui/Badge";
import type { ListingStatus } from "@/types/domain";
import type { Worker } from "./types";

/** The one place listing statuses get their label and colour (design-system §4). */
export const listingStatus: Record<ListingStatus, { label: string; tone: BadgeTone; description: string }> = {
  draft: { label: "Draft", tone: "neutral", description: "Not visible to families yet." },
  listed: { label: "Listed", tone: "verified", description: "All four checks verified. Can be proposed to families." },
  delisted: { label: "Delisted", tone: "warning", description: "Hidden from families until listed again." },
  suspended: { label: "Suspended", tone: "danger", description: "Suspended by HelpVerified. Contact us to resolve." },
};

export function availabilityLabel(worker: Pick<Worker, "available" | "active_placement">): string {
  if (worker.available || !worker.active_placement) return "Available";
  const { status, trial_ends_on } = worker.active_placement;
  if (status === "pending_payment") return "Being placed";
  if (status === "trial" && trial_ends_on) return `On trial until ${trial_ends_on}`;
  return "In a placement";
}
