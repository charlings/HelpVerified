import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { writeAudit } from "../admin-domain";
import { db, fileBlobs, persist } from "../db";
import { agencyOf, nowIso } from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

const UNAVAILABLE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <rect width="800" height="500" fill="rgb(243,248,255)"/>
      <text x="400" y="235" text-anchor="middle" font-family="sans-serif" font-size="28" fill="rgb(10,34,73)">Demo document</text>
      <text x="400" y="280" text-anchor="middle" font-family="sans-serif" font-size="20" fill="rgb(71,85,105)">Files uploaded in demo mode stay in the browser and are gone after a reload.</text>
    </svg>`,
  );

export const documentHandlers = [
  // Permission check → access log → short-lived URL. Families never get document URLs (404, not 403).
  http.get(`${base}/documents/:id/url`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    if (!user) return errorResponse("UNAUTHENTICATED", "Not signed in.");

    const doc = db.documents.find((d) => d.id === params.id && !d.deleted_at);
    const item = doc && db.verificationItems.find((i) => i.id === doc.item_id);
    const worker = item && db.workers.find((w) => w.id === item.worker_id);
    const allowed =
      worker &&
      (user.role === "super_admin" || (user.role === "agency_admin" && agencyOf(user)?.id === worker.agency_id));
    if (!doc || !allowed) return errorResponse("NOT_FOUND", "Document not found.");

    db.accessLog.push({
      id: crypto.randomUUID(),
      document_id: doc.id,
      user_id: user.id,
      purpose: "verification_review",
      created_at: nowIso(),
    });
    // database.md: document views are domain events and go to audit_log too.
    const kind = item.kind;
    writeAudit(user, "document.viewed", "document", doc.id, {
      label: `${worker.full_name}, ${kind} evidence`,
      kind,
      worker_id: worker.id,
    });
    persist();
    return HttpResponse.json({
      url: fileBlobs.get(doc.public_id) ?? UNAVAILABLE,
      expires_at: new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
    });
  }),
];
