import { api } from "@/lib/api-client";
import type { AgencyStatus, SubscriptionStatus } from "@/types/domain";

export type AgencyDashboard = {
  /** `status_reason`: why the agency was rejected or suspended. */
  agency: { id: string; name: string; status: AgencyStatus; status_reason: string | null };
  subscription: { status: SubscriptionStatus; current_period_end: string } | null;
  /** Approved and subscribed: may list workers and propose. */
  active: boolean;
  workers: { total: number; draft: number; listed: number; delisted: number; suspended: number };
  checks_needing_attention: number;
  open_requests: number;
  trials_ending: { id: string; worker_name: string; family_name: string; trial_ends_on: string }[];
};

export type AgencyProfile = {
  id: string;
  name: string;
  cac_number: string;
  email: string;
  phone: string;
  address_line: string;
  state: string;
  lga: string;
  roles_offered: string[];
  status: AgencyStatus;
  created_at: string;
};

export const agencyKeys = {
  dashboard: ["agency", "dashboard"] as const,
  profile: ["agency", "profile"] as const,
};

export const agenciesApi = {
  dashboard: () => api.get<AgencyDashboard>("/agencies/me/dashboard"),
  profile: () => api.get<AgencyProfile>("/agencies/me"),
};
