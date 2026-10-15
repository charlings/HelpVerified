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
  | "worker.evidence_deleted";

export type AuditEntry = {
  id: string;
  action: AuditAction;
  actor: { id: string; name: string; role: Role } | null;
  entity: "agency" | "worker" | "placement" | "document";
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
};
