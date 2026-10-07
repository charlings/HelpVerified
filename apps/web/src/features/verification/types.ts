import type { VerificationKind, VerificationStatus } from "@/types/domain";

/** Document metadata only — never a URL. URLs come from `GET /documents/{id}/url`, short-lived and logged. */
export type VerificationDocument = {
  id: string;
  format: "jpg" | "png" | "pdf";
  bytes: number;
  created_at: string;
};

export type GuarantorDetails = { name?: string; phone?: string; relationship?: string };
export type ReferenceDetails = { referee_name?: string; referee_phone?: string; relationship?: string };
export type AddressDetails = { address_line?: string };
export type IdDetails = { document_type?: string };

export type VerificationDetails = GuarantorDetails & ReferenceDetails & AddressDetails & IdDetails;

export type VerificationItem = {
  kind: VerificationKind;
  status: VerificationStatus;
  details: VerificationDetails;
  verified_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  /** A super admin sent this verified check back for review; the agency must re-check and verify again. */
  flag_reason: string | null;
  flagged_at: string | null;
  documents: VerificationDocument[];
};
