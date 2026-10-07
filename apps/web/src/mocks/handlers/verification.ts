import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import type { VerificationKind } from "@/types/domain";
import { db, persist } from "../db";
import { applyExpiry, delistIfListed, expiryFor, itemOut, itemsFor, nowIso, ownWorker, requireAgency } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const KINDS: readonly string[] = ["id", "guarantor", "references", "address"];
const MAX_BYTES = 10 * 1024 * 1024;
const FORMATS = ["jpg", "png", "pdf"];

/** Shared lookup: own worker + the requested check, or an error response. */
function resolve(request: Request, params: Record<string, unknown>) {
  const ctx = requireAgency(authenticate(request));
  if ("error" in ctx) return { error: ctx.error };
  applyExpiry();
  const worker = ownWorker(ctx.agency, params.id as string);
  if (!worker || !KINDS.includes(params.kind as string)) return { error: errorResponse("NOT_FOUND", "Not found.") };
  const item = itemsFor(worker.id).find((i) => i.kind === (params.kind as VerificationKind))!;
  return { worker, item, userId: authenticate(request)!.id };
}

function hasEvidence(itemId: string) {
  return db.documents.some((d) => d.item_id === itemId && !d.deleted_at);
}

/** New details or evidence put a not-started, rejected or expired check back in review. */
function markSubmitted(item: (typeof db.verificationItems)[number]) {
  if (item.status === "not_started" || item.status === "rejected" || item.status === "expired") {
    item.status = "submitted";
    item.rejection_reason = null;
  }
}

export const verificationHandlers = [
  http.get(`${base}/workers/:id/verification`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    applyExpiry();
    const worker = ownWorker(ctx.agency, params.id as string);
    if (!worker) return errorResponse("NOT_FOUND", "Worker not found.");
    return HttpResponse.json(itemsFor(worker.id).map(itemOut));
  }),

  http.patch(`${base}/workers/:id/verification/:kind`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const found = resolve(request, params);
    if ("error" in found) return found.error;
    const { item, userId } = found;
    const body = (await request.json().catch(() => ({}))) as {
      details?: Record<string, string>;
      status?: string;
      rejection_reason?: string;
    };

    if (body.details) {
      if (item.status === "verified") {
        return errorResponse("ILLEGAL_TRANSITION", "Reject the check before changing verified details.");
      }
      item.details = { ...item.details, ...body.details };
      markSubmitted(item);
    } else if (body.status === "verified") {
      if (item.status !== "submitted")
        return errorResponse("ILLEGAL_TRANSITION", "Only checks in review can be verified.");
      if (!hasEvidence(item.id)) return errorResponse("EVIDENCE_REQUIRED", "Upload evidence first.");
      item.status = "verified";
      item.verified_by = userId;
      item.verified_at = nowIso();
      item.expires_at = expiryFor(item.kind);
      item.rejection_reason = null;
      // Re-verifying answers an admin flag.
      item.flag_reason = null;
      item.flagged_at = null;
    } else if (body.status === "rejected") {
      const reason = body.rejection_reason?.trim();
      if (!reason) {
        return errorResponse("VALIDATION_ERROR", "Reason required.", {
          rejection_reason: ["Explain why this check was rejected."],
        });
      }
      if (item.status !== "submitted" && item.status !== "verified") {
        return errorResponse("ILLEGAL_TRANSITION", "Only checks in review or verified can be rejected.");
      }
      const wasVerified = item.status === "verified";
      item.status = "rejected";
      item.rejection_reason = reason;
      item.verified_at = null;
      item.verified_by = null;
      item.expires_at = null;
      // Rejecting a verified check delists the worker; an active placement is not ended.
      if (wasVerified) delistIfListed(item.worker_id);
    } else {
      return errorResponse("BAD_REQUEST", "Send details, or status verified/rejected.");
    }
    persist();
    return HttpResponse.json(itemOut(item));
  }),

  http.post(`${base}/workers/:id/verification/:kind/documents`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const found = resolve(request, params);
    if ("error" in found) return found.error;
    const { worker, item, userId } = found;
    const { public_id } = (await request.json().catch(() => ({}))) as { public_id?: string };

    // The API checks the asset with Cloudinary's Admin API before trusting it.
    const upload = public_id ? db.uploads[public_id] : undefined;
    const folder = `workers/docs/${worker.id}/${item.kind}`;
    if (!upload || upload.folder !== folder) {
      return errorResponse("VALIDATION_ERROR", "Unknown upload.", { public_id: ["Upload the file again."] });
    }
    if (upload.bytes > MAX_BYTES || !FORMATS.includes(upload.format)) {
      return errorResponse("VALIDATION_ERROR", "Invalid file.", { public_id: ["Use a JPG, PNG or PDF up to 10 MB."] });
    }
    const doc = {
      id: `doc-${crypto.randomUUID()}`,
      item_id: item.id,
      public_id: upload.public_id,
      format: upload.format as "jpg" | "png" | "pdf",
      bytes: upload.bytes,
      uploaded_by: userId,
      created_at: nowIso(),
      deleted_at: null,
    };
    db.documents.push(doc);
    markSubmitted(item);
    persist();
    return HttpResponse.json(
      { id: doc.id, format: doc.format, bytes: doc.bytes, created_at: doc.created_at },
      { status: 201 },
    );
  }),

  http.delete(`${base}/workers/:id/verification/:kind/documents/:docId`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const found = resolve(request, params);
    if ("error" in found) return found.error;
    const { item } = found;
    const doc = db.documents.find((d) => d.id === params.docId && d.item_id === item.id && !d.deleted_at);
    if (!doc) return errorResponse("NOT_FOUND", "Document not found.");
    doc.deleted_at = nowIso();
    // Removing evidence from a verified check sends it back to review (and delists the worker).
    if (item.status === "verified") {
      item.status = "submitted";
      item.verified_at = null;
      item.verified_by = null;
      item.expires_at = null;
      delistIfListed(item.worker_id);
    }
    persist();
    return new HttpResponse(null, { status: 204 });
  }),
];
