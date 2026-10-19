/**
 * Business rules shared by mock handlers. They mirror database.md (listing gate, one active
 * placement per worker, delist on item change) so the UI is built against realistic behaviour.
 */
import type { ActivePlacementStatus, PaymentStatus, RefundStatus, VerificationKind } from "@/types/domain";
import { db, persist, type MockAgency, type MockUser, type MockWorker } from "./db";
import { errorResponse } from "./errors";

export const ACTIVE_PLACEMENT_STATUSES: readonly ActivePlacementStatus[] = ["pending_payment", "trial", "confirmed"];
const KINDS: readonly VerificationKind[] = ["id", "guarantor", "references", "address"];
const RECHECK_MONTHS = 12;

export function nowIso() {
  return new Date().toISOString();
}

export function expiryFor(kind: VerificationKind, from = new Date()): string | null {
  if (kind !== "references" && kind !== "address") return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + RECHECK_MONTHS);
  return d.toISOString();
}

/** Stand-in for the nightly verification_expiry job: lapsed items become `expired` and delist their worker. */
export function applyExpiry() {
  const now = Date.now();
  let changed = false;
  for (const item of db.verificationItems) {
    if (item.status === "verified" && item.expires_at && Date.parse(item.expires_at) <= now) {
      item.status = "expired";
      delistIfListed(item.worker_id);
      changed = true;
    }
  }
  if (changed) persist();
}

/** Trigger `verification_items_delist`: a worker can't stay listed once any check stops being verified. */
export function delistIfListed(workerId: string) {
  const worker = db.workers.find((w) => w.id === workerId);
  if (worker?.listing_status === "listed") {
    worker.listing_status = "delisted";
    worker.listed_at = null;
  }
}

export function itemsFor(workerId: string) {
  return KINDS.map((kind) => db.verificationItems.find((i) => i.worker_id === workerId && i.kind === kind)!);
}

export function verifiedCount(workerId: string) {
  return itemsFor(workerId).filter((i) => i.status === "verified").length;
}

export function activePlacementFor(workerId: string) {
  return db.placements.find(
    (p) => p.worker_id === workerId && ACTIVE_PLACEMENT_STATUSES.includes(p.status as ActivePlacementStatus),
  );
}

export function agencyOf(user: MockUser): MockAgency | undefined {
  return db.agencies.find((a) => a.admin_user_id === user.id);
}

export function subscriptionOf(agencyId: string) {
  return db.subscriptions.find((s) => s.agency_id === agencyId);
}

/** Listing and proposing need an approved agency with an active subscription. */
export function isAgencyActive(agency: MockAgency) {
  return agency.status === "approved" && subscriptionOf(agency.id)?.status === "active";
}

/** Resolves the caller's agency, or the error response to return. */
export function requireAgency(user: MockUser | null): { agency: MockAgency } | { error: Response } {
  if (!user) return { error: errorResponse("UNAUTHENTICATED", "Not signed in.") };
  if (user.role !== "agency_admin") return { error: errorResponse("FORBIDDEN", "Agency admins only.") };
  const agency = agencyOf(user);
  if (!agency) return { error: errorResponse("FORBIDDEN", "Register your agency first.") };
  return { agency };
}

/** Another tenant's worker is reported as not found, so IDs can't be probed. */
export function ownWorker(agency: MockAgency, workerId: string | undefined): MockWorker | undefined {
  return db.workers.find((w) => w.id === workerId && w.agency_id === agency.id);
}

export function workerOut(worker: MockWorker) {
  const items = itemsFor(worker.id);
  const active = activePlacementFor(worker.id);
  return {
    id: worker.id,
    full_name: worker.full_name,
    role: worker.role,
    years_experience: worker.years_experience,
    languages: worker.languages,
    live_in_ok: worker.live_in_ok,
    state: worker.state,
    lga: worker.lga,
    expected_salary_min_kobo: worker.expected_salary_min_kobo,
    expected_salary_max_kobo: worker.expected_salary_max_kobo,
    photo_url: null,
    nin_last4: worker.nin_last4,
    listing_status: worker.listing_status,
    listed_at: worker.listed_at,
    available: !active,
    active_placement: active
      ? { id: active.id, status: active.status as ActivePlacementStatus, trial_ends_on: active.trial_ends_on }
      : null,
    verification: Object.fromEntries(items.map((i) => [i.kind, i.status])),
    verified_count: items.filter((i) => i.status === "verified").length,
    created_at: worker.created_at,
  };
}

export function itemOut(item: (typeof db.verificationItems)[number]) {
  return {
    kind: item.kind,
    status: item.status,
    details: item.details,
    verified_at: item.verified_at,
    expires_at: item.expires_at,
    rejection_reason: item.rejection_reason,
    flag_reason: item.flag_reason ?? null,
    flagged_at: item.flagged_at ?? null,
    documents: db.documents
      .filter((d) => d.item_id === item.id && !d.deleted_at)
      .map((d) => ({ id: d.id, format: d.format, bytes: d.bytes, created_at: d.created_at })),
  };
}

export function paginate<T>(rows: T[], url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? 20) || 20));
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), page, page_size: pageSize, total: rows.length };
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The API derives `refund_status` from the payment's refund rows; the mock has at most one refund, never processed. */
export function refundStatusOf(status: PaymentStatus): RefundStatus {
  if (status === "refund_pending") return "in_progress";
  if (status === "refunded") return "completed";
  return "none";
}
