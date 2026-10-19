/**
 * Admin rules for the mock: agency status moves, what suspension does, and audit_log writes.
 * Mirrors the backend's admin service; screens render `allowed_actions` and never derive them.
 */
import type { AgencyAction } from "@/features/admin";
import type { AgencyStatus } from "@/types/domain";
import type { AlertKind } from "@/features/admin";
import { db, type AuditAction, type MockAgency, type MockAlert, type MockAuditEntry, type MockUser } from "./db";
import { activePlacementFor, nowIso, subscriptionOf } from "./domain";
import { errorResponse } from "./errors";

/** Agency status moves (plan M7, decision 1). Rejected is final in v1. */
export const agencyTransitions: Record<AgencyAction, { from: AgencyStatus[]; to: AgencyStatus; audit: AuditAction }> = {
  approve: { from: ["pending"], to: "approved", audit: "agency.approved" },
  reject: { from: ["pending"], to: "rejected", audit: "agency.rejected" },
  suspend: { from: ["approved"], to: "suspended", audit: "agency.suspended" },
  reinstate: { from: ["suspended"], to: "approved", audit: "agency.reinstated" },
};

export const reasonRequired: readonly AgencyAction[] = ["reject", "suspend"];

export function agencyAllowedActions(agency: MockAgency): AgencyAction[] {
  return (Object.keys(agencyTransitions) as AgencyAction[]).filter((a) =>
    agencyTransitions[a].from.includes(agency.status),
  );
}

export function requireAdmin(user: MockUser | null): { admin: MockUser } | { error: Response } {
  if (!user) return { error: errorResponse("UNAUTHENTICATED", "Not signed in.") };
  if (user.role !== "super_admin") return { error: errorResponse("FORBIDDEN", "Admins only.") };
  return { admin: user };
}

export function writeAudit(
  actor: MockUser | null,
  action: AuditAction,
  entity: MockAuditEntry["entity"],
  entityId: string,
  data: MockAuditEntry["data"],
) {
  db.auditLog.unshift({
    id: `al-${crypto.randomUUID()}`,
    actor_id: actor?.id ?? null,
    action,
    entity,
    entity_id: entityId,
    data,
    created_at: nowIso(),
  });
}

/**
 * Suspension (decision 2): listed workers become `suspended` and leave families' view, pending proposals
 * are withdrawn, active placements keep running. Reinstating returns those workers to `delisted`, so the
 * agency relists them through the four-check gate.
 */
export function applyAgencyStatusEffects(agency: MockAgency, action: AgencyAction) {
  const workers = db.workers.filter((w) => w.agency_id === agency.id);
  if (action === "suspend") {
    for (const w of workers) {
      if (w.listing_status === "listed") {
        w.listing_status = "suspended";
        w.listed_at = null;
      }
    }
    for (const p of db.proposals) if (p.agency_id === agency.id && p.status === "pending") p.status = "withdrawn";
  }
  if (action === "reinstate") {
    for (const w of workers) if (w.listing_status === "suspended") w.listing_status = "delisted";
  }
}

export function agencySummaryOut(agency: MockAgency) {
  return {
    id: agency.id,
    name: agency.name,
    cac_number: agency.cac_number,
    state: agency.state,
    lga: agency.lga,
    roles_offered: agency.roles_offered,
    status: agency.status,
    workers_total: db.workers.filter((w) => w.agency_id === agency.id).length,
    created_at: agency.created_at,
  };
}

export function agencyDetailOut(agency: MockAgency) {
  const workers = db.workers.filter((w) => w.agency_id === agency.id);
  const admin = db.users.find((u) => u.id === agency.admin_user_id);
  const subscription = subscriptionOf(agency.id);
  return {
    ...agencySummaryOut(agency),
    email: agency.email,
    phone: agency.phone,
    address_line: agency.address_line,
    approved_at: agency.approved_at,
    status_reason: agency.status_reason,
    admin: admin ? { full_name: admin.full_name, email: admin.email } : null,
    subscription: subscription
      ? { status: subscription.status, current_period_end: subscription.current_period_end }
      : null,
    workers: {
      total: workers.length,
      draft: workers.filter((w) => w.listing_status === "draft").length,
      listed: workers.filter((w) => w.listing_status === "listed").length,
      delisted: workers.filter((w) => w.listing_status === "delisted").length,
      suspended: workers.filter((w) => w.listing_status === "suspended").length,
    },
    active_placements: workers.filter((w) => activePlacementFor(w.id)).length,
    history: db.auditLog.filter((e) => e.entity === "agency" && e.entity_id === agency.id).map(auditOut),
    allowed_actions: agencyAllowedActions(agency),
  };
}

export function auditOut(entry: MockAuditEntry) {
  const actor = entry.actor_id ? db.users.find((u) => u.id === entry.actor_id) : undefined;
  return {
    id: entry.id,
    action: entry.action,
    actor: actor ? { id: actor.id, name: actor.full_name, role: actor.role } : null,
    entity: entry.entity,
    entity_id: entry.entity_id,
    entity_label: entry.data.label,
    // A document view links to the worker it belongs to.
    worker_id: entry.data.worker_id ?? null,
    reason: entry.data.reason ?? null,
    created_at: entry.created_at,
  };
}

/** Opens an alert unless one for the same kind and payment is still unresolved (admin_alerts_one_open_per_subject). */
export function raiseAlert(kind: AlertKind, paymentId: string, reference: string) {
  const subject = `payment:${paymentId}`;
  if (db.alerts.some((a) => a.kind === kind && a.subject_key === subject && !a.resolved_at)) return;
  db.alerts.unshift({
    id: `alert-${crypto.randomUUID()}`,
    kind,
    subject_key: subject,
    payment_id: paymentId,
    payment_reference: reference,
    opened_at: nowIso(),
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
  });
}

export function alertOut(alert: MockAlert) {
  return {
    ...alert,
    state: alert.resolved_at ? "resolved" : alert.acknowledged_at ? "acknowledged" : "open",
    details: {},
  };
}
