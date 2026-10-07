import type { BadgeTone } from "@/components/ui/Badge";
import { verificationKinds, type VerificationKind, type VerificationStatus } from "@/types/domain";
import type { VerificationDetails } from "./types";

/** The one place check statuses get their label, colour and explanation. */
export const verificationStatus: Record<VerificationStatus, { label: string; tone: BadgeTone; description: string }> = {
  not_started: {
    label: "Not started",
    tone: "neutral",
    description: "Add details and upload evidence to start this check.",
  },
  submitted: {
    label: "In review",
    tone: "info",
    description: "Evidence is in. Review it, then verify or reject the check.",
  },
  verified: { label: "Verified", tone: "verified", description: "This check is complete." },
  rejected: {
    label: "Rejected",
    tone: "danger",
    description: "Fix the problem and upload new evidence to submit it again.",
  },
  expired: {
    label: "Expired",
    tone: "warning",
    description: "This check needs renewing. Upload fresh evidence and verify it again.",
  },
};

type DetailField = { name: keyof VerificationDetails; label: string; type?: "text" | "tel"; hint?: string };

/** What each check is called and which details the agency records for it (verification_items.details). */
export const verificationKindInfo: Record<
  VerificationKind,
  { label: string; summary: string; evidence: string; fields: DetailField[] }
> = {
  id: {
    label: "Identity",
    summary: "Government-issued ID and the worker's NIN.",
    evidence: "A clear photo or scan of the ID (NIN slip, national ID card, passport or driver's licence).",
    fields: [{ name: "document_type", label: "Type of ID", hint: "For example: NIN slip, passport." }],
  },
  guarantor: {
    label: "Guarantor",
    summary: "Someone who agrees to stand for the worker.",
    evidence: "The signed guarantor form and the guarantor's ID.",
    fields: [
      { name: "name", label: "Guarantor's full name" },
      { name: "phone", label: "Guarantor's phone", type: "tel" },
      { name: "relationship", label: "Relationship to the worker" },
    ],
  },
  references: {
    label: "References",
    summary: "Previous employers, contacted about conduct and reliability.",
    evidence: "Reference letters or notes from your calls with referees.",
    fields: [
      { name: "referee_name", label: "Referee's full name" },
      { name: "referee_phone", label: "Referee's phone", type: "tel" },
      { name: "relationship", label: "How the referee knows the worker" },
    ],
  },
  address: {
    label: "Address",
    summary: "The worker's home address, confirmed.",
    evidence: "Proof of residence, such as a utility bill or tenancy agreement.",
    fields: [{ name: "address_line", label: "Home address" }],
  },
};

/** Checks that aren't verified yet, by name, in checklist order. */
export function outstandingChecks(statuses: Record<VerificationKind, VerificationStatus>): string[] {
  return verificationKinds.filter((k) => statuses[k] !== "verified").map((k) => verificationKindInfo[k].label);
}
