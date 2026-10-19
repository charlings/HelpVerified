import type { Role } from "@/config/routes";
import type { VerificationItem } from "@/features/verification";
import type { Worker } from "@/features/workers";
import type { AgencyStatus, SubscriptionStatus } from "@/types/domain";

export type AgencyAction = "approve" | "reject" | "suspend" | "reinstate";

export type AuditAction =
  | "agency.approved"
  | "agency.rejected"
  | "agency.suspended"
  | "agency.reinstated"
  | "worker.check_flagged"
  | "document.viewed"
  | "placement.ended"
  | "worker.evidence_deleted"
  | "alert.acknowledged"
  | "alert.resolved";

export type AuditEntry = {
  id: string;
  action: AuditAction;
  actor: { id: string; name: string; role: Role } | null;
  entity: "agency" | "worker" | "placement" | "document" | "alert";
  entity_id: string | null;
  entity_label: string;
  worker_id: string | null;
  reason: string | null;
  created_at: string;
};

export type AdminAgencySummary = {
  id: string;
  name: string;
  cac_number: string;
  state: string;
  lga: string;
  roles_offered: string[];
  status: AgencyStatus;
  workers_total: number;
  created_at: string;
};

export type AdminAgency = AdminAgencySummary & {
  email: string;
  phone: string;
  address_line: string;
  approved_at: string | null;
  status_reason: string | null;
  admin: { full_name: string; email: string } | null;
  subscription: { status: SubscriptionStatus; current_period_end: string | null } | null;
  workers: { total: number; draft: number; listed: number; delisted: number; suspended: number };
  active_placements: number;
  history: AuditEntry[];
  allowed_actions: AgencyAction[];
};

export type AdminWorker = Worker & { agency: { id: string; name: string } };
export type AdminWorkerDetail = AdminWorker & { checks: VerificationItem[] };

export type AdminOverview = {
  agencies_pending: number;
  workers_listed: number;
  placements_active: number;
  trials_ending_soon: number;
  fees_paid_this_month_kobo: number;
  pending_agencies: AdminAgencySummary[];
  recent_audit: AuditEntry[];
  /** Payment alerts not yet resolved (acknowledged ones included). */
  open_alerts: number;
};

/** Payment problems an admin must resolve (ADR 0017). Acknowledged alerts are still unresolved. */
export type AlertKind =
  | "checkout_unresolved"
  | "unmatched_charge"
  | "refund_attention"
  | "refund_stuck"
  | "refund_admin_review"
  | "late_payment"
  | "duplicate_charge"
  | "settlement_failed"
  | "legacy_unresolved";
export type AlertState = "open" | "acknowledged" | "resolved";
export type AlertFilter = "open" | "resolved" | "all";

export type AdminAlert = {
  id: string;
  kind: AlertKind;
  state: AlertState;
  subject_key: string;
  payment_id: string | null;
  payment_reference: string | null;
  details: Record<string, unknown>;
  opened_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  /** The admin's name, or "System" when Paystack's evidence resolved it. */
  resolved_by: string | null;
  resolution_note: string | null;
};
