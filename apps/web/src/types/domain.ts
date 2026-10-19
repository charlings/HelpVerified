/**
 * Domain vocabulary shared by several features. Mirrors the PostgreSQL enums in database.md §2;
 * becomes generated contract types (packages/contracts) in B7.
 */
import type { ServiceSlug } from "@/config/routes";

export type WorkerRole = ServiceSlug;
export type ListingStatus = "draft" | "listed" | "delisted" | "suspended";

export type VerificationKind = "id" | "guarantor" | "references" | "address";
export const verificationKinds = [
  "id",
  "guarantor",
  "references",
  "address",
] as const satisfies readonly VerificationKind[];
export type VerificationStatus = "not_started" | "submitted" | "verified" | "rejected" | "expired";

export type PlacementStatus = "pending_payment" | "trial" | "confirmed" | "ended" | "cancelled";
export type ActivePlacementStatus = Extract<PlacementStatus, "pending_payment" | "trial" | "confirmed">;
export type PlacementEndReason =
  "completed" | "replaced" | "family_ended" | "agency_ended" | "admin_ended" | "worker_left" | "payment_expired";

export type RequestStatus = "open" | "matched" | "cancelled" | "closed";
export type ProposalStatus = "pending" | "accepted" | "declined" | "withdrawn" | "superseded";
export type AgencyStatus = "pending" | "approved" | "suspended" | "rejected";
export type SubscriptionStatus = "active" | "non_renewing" | "past_due" | "cancelled";
/** `refund_pending`: being refunded; `refunded` only once Paystack confirms the refund was processed (ADR 0017). */
export type PaymentStatus = "pending" | "success" | "failed" | "refund_pending" | "refunded";
export type RefundStatus = "none" | "in_progress" | "needs_attention" | "completed";

/** List responses (api-contracts.md §1). */
export type Paginated<T> = { items: T[]; page: number; page_size: number; total: number };
