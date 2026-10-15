import type {
  ActivePlacementStatus,
  ListingStatus,
  VerificationKind,
  VerificationStatus,
  WorkerRole,
} from "@/types/domain";

/** The worker's current active placement, if any. */
export type ActivePlacementSummary = {
  id: string;
  status: ActivePlacementStatus;
  trial_ends_on: string | null;
};

/** `WorkerOut` (agency view), api-contracts.md §4. */
export type Worker = {
  id: string;
  full_name: string;
  role: WorkerRole;
  years_experience: number;
  languages: string[];
  live_in_ok: boolean;
  /** Validated against the list of states when written; responses carry it as plain text. */
  state: string;
  lga: string;
  expected_salary_min_kobo: number | null;
  expected_salary_max_kobo: number | null;
  photo_url: string | null;
  nin_last4: string;
  listing_status: ListingStatus;
  listed_at: string | null;
  available: boolean;
  active_placement: ActivePlacementSummary | null;
  verification: Record<VerificationKind, VerificationStatus>;
  verified_count: number;
  created_at: string;
};

/**
 * `WorkerPublicOut`: what a family may see, and only after the worker was proposed to them.
 * First name only; no NIN digits, address, phone or documents.
 */
export type WorkerPublic = {
  id: string;
  first_name: string;
  role: WorkerRole;
  years_experience: number;
  languages: string[];
  live_in_ok: boolean;
  agency: { id: string; name: string };
  /** Verified checks with the date each was verified. */
  badges: { kind: VerificationKind; verified_at: string }[];
  /** Still free to accept (no active placement). */
  available: boolean;
};

export type WorkerFilters = {
  role?: WorkerRole;
  listing_status?: ListingStatus;
  page?: number;
};
