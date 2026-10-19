/** Mock database rows. Shapes follow database.md §3 (snake_case), simplified where the UI doesn't care. */
import type { Role } from "@/config/routes";
import type { AlertKind, AuditAction } from "@/features/admin";
import type {
  AgencyStatus,
  ListingStatus,
  PaymentStatus,
  PlacementEndReason,
  PlacementStatus,
  ProposalStatus,
  RequestStatus,
  SubscriptionStatus,
  VerificationKind,
  VerificationStatus,
  WorkerRole,
} from "@/types/domain";

export type MockUser = {
  id: string;
  email: string;
  password: string; // mock only — the real API stores argon2id hashes
  full_name: string;
  role: Role;
  status: "active" | "suspended";
  email_verified_at: string | null;
  privacy_notice_version: string | null;
};

export type MockAgency = {
  id: string;
  admin_user_id: string;
  name: string;
  cac_number: string;
  email: string;
  phone: string;
  address_line: string;
  state: string;
  lga: string;
  roles_offered: string[];
  status: AgencyStatus;
  approved_at: string | null;
  /** Why it was rejected or suspended; shown to the agency. */
  status_reason: string | null;
  created_at: string;
};

export type { AuditAction };

/** audit_log (database.md): who did what to which entity. `data` holds the reason and a display label. */
export type MockAuditEntry = {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  entity: "agency" | "worker" | "placement" | "document" | "alert";
  entity_id: string;
  data: { label: string; reason?: string; kind?: string; worker_id?: string };
  created_at: string;
};

export type MockFamily = { id: string; user_id: string; name: string; state: string; lga: string };

export type MockWorker = {
  id: string;
  agency_id: string;
  full_name: string;
  role: WorkerRole;
  years_experience: number;
  languages: string[];
  live_in_ok: boolean;
  state: string;
  lga: string;
  expected_salary_min_kobo: number | null;
  expected_salary_max_kobo: number | null;
  nin_hash: string; // SHA-256 in the mock; HMAC with a secret pepper in the real API. Never the raw NIN.
  nin_last4: string;
  consent_at: string;
  listing_status: ListingStatus;
  listed_at: string | null;
  created_at: string;
};

export type MockVerificationItem = {
  id: string;
  worker_id: string;
  kind: VerificationKind;
  status: VerificationStatus;
  details: Record<string, string>;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  /** Set when a super admin flags a verified check; cleared when the agency verifies it again. */
  flag_reason?: string | null;
  flagged_at?: string | null;
};

export type MockDocument = {
  id: string;
  item_id: string;
  public_id: string;
  format: "jpg" | "png" | "pdf";
  bytes: number;
  uploaded_by: string;
  created_at: string;
  deleted_at: string | null;
};

export type MockAccessLog = { id: string; document_id: string; user_id: string; purpose: string; created_at: string };

export type MockUpload = { public_id: string; folder: string; bytes: number; format: string; resource_type: string };

export type MockRequest = {
  id: string;
  family_id: string;
  role: WorkerRole;
  title: string;
  description: string;
  schedule: "full_time" | "part_time";
  live_in: boolean;
  state: string;
  lga: string;
  budget_min_kobo: number | null;
  budget_max_kobo: number | null;
  start_date: string;
  trial_days: number;
  status: RequestStatus;
  replaces_placement_id: string | null;
  created_at: string;
};

export type MockProposal = {
  id: string;
  request_id: string;
  worker_id: string;
  agency_id: string;
  note: string | null;
  status: ProposalStatus;
  created_at: string;
};

export type MockPlacement = {
  id: string;
  request_id: string;
  proposal_id: string;
  worker_id: string;
  family_id: string;
  agency_id: string;
  status: PlacementStatus;
  hold_expires_at: string | null;
  trial_starts_on: string | null;
  trial_ends_on: string | null;
  confirmed_at: string | null;
  ended_at: string | null;
  end_reason: PlacementEndReason | null;
  replacements_used: number;
  created_at: string;
};

export type MockPlacementEvent = {
  id: string;
  placement_id: string;
  from_status: PlacementStatus | null;
  to_status: PlacementStatus;
  actor: "family" | "agency" | "admin" | "system";
  reason: string | null;
  created_at: string;
};

export type MockSubscription = {
  agency_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  current_period_end: string;
};

export type MockPayment = {
  id: string;
  kind: "placement_fee" | "subscription";
  payer_user_id: string;
  placement_id: string | null;
  agency_id: string | null;
  amount_kobo: number;
  reference: string;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
};

/** admin_alerts (ADR 0017): one unresolved alert per kind and subject. */
export type MockAlert = {
  id: string;
  kind: AlertKind;
  subject_key: string;
  payment_id: string | null;
  payment_reference: string | null;
  opened_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};
