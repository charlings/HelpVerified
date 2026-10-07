import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { createWorkerSchema } from "@/features/workers";
import type { VerificationKind } from "@/types/domain";
import { db, persist } from "../db";
import {
  applyExpiry,
  isAgencyActive,
  nowIso,
  ownWorker,
  paginate,
  requireAgency,
  sha256Hex,
  verifiedCount,
  workerOut,
} from "../domain";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";
import { authenticate, fieldErrors } from "./auth";

const base = env.NEXT_PUBLIC_API_BASE_URL;

export const workerHandlers = [
  http.get(`${base}/workers`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    applyExpiry();

    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const listing = url.searchParams.get("listing_status");
    const available = url.searchParams.get("available");
    const rows = db.workers
      .filter((w) => w.agency_id === ctx.agency.id)
      .filter((w) => !role || w.role === role)
      .filter((w) => !listing || w.listing_status === listing)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(workerOut)
      .filter((w) => available === null || String(w.available) === available);
    return HttpResponse.json(paginate(rows, url));
  }),

  http.post(`${base}/workers`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;

    const parsed = createWorkerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid worker.", fieldErrors(parsed.error.issues));
    const { nin, ...input } = parsed.data;

    const nin_hash = await sha256Hex(nin);
    if (db.workers.some((w) => w.nin_hash === nin_hash)) {
      return errorResponse("DUPLICATE_WORKER", "A worker with this NIN already exists.");
    }

    const id = `w-${crypto.randomUUID()}`;
    const created = nowIso();
    db.workers.push({
      id,
      agency_id: ctx.agency.id,
      full_name: input.full_name,
      role: input.role,
      years_experience: input.years_experience,
      languages: input.languages,
      live_in_ok: input.live_in_ok,
      state: input.state,
      lga: input.lga,
      expected_salary_min_kobo: input.expected_salary_min_kobo,
      expected_salary_max_kobo: input.expected_salary_max_kobo,
      nin_hash,
      nin_last4: nin.slice(-4),
      consent_at: created,
      listing_status: "draft",
      listed_at: null,
      created_at: created,
    });
    for (const kind of ["id", "guarantor", "references", "address"] as VerificationKind[]) {
      db.verificationItems.push({
        id: `vi-${id}-${kind}`,
        worker_id: id,
        kind,
        status: "not_started",
        details: {},
        verified_by: null,
        verified_at: null,
        expires_at: null,
        rejection_reason: null,
      });
    }
    persist();
    return HttpResponse.json(workerOut(db.workers.at(-1)!), { status: 201 });
  }),

  http.get(`${base}/workers/:id`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    applyExpiry();
    const worker = ownWorker(ctx.agency, params.id as string);
    return worker ? HttpResponse.json(workerOut(worker)) : errorResponse("NOT_FOUND", "Worker not found.");
  }),

  http.post(`${base}/workers/:id/list`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    applyExpiry();
    const worker = ownWorker(ctx.agency, params.id as string);
    if (!worker) return errorResponse("NOT_FOUND", "Worker not found.");
    if (!isAgencyActive(ctx.agency)) return errorResponse("AGENCY_NOT_ACTIVE", "Agency not active.");
    if (worker.listing_status === "suspended") return errorResponse("ILLEGAL_TRANSITION", "Worker suspended.");
    if (worker.listing_status === "listed") return HttpResponse.json(workerOut(worker));
    // The listing gate (database.md §4): all four checks verified and unexpired.
    if (verifiedCount(worker.id) < 4) return errorResponse("WORKER_NOT_VERIFIED", "Not all checks are verified.");
    worker.listing_status = "listed";
    worker.listed_at = nowIso();
    persist();
    return HttpResponse.json(workerOut(worker));
  }),

  http.post(`${base}/workers/:id/delist`, async ({ request, params }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const ctx = requireAgency(authenticate(request));
    if ("error" in ctx) return ctx.error;
    const worker = ownWorker(ctx.agency, params.id as string);
    if (!worker) return errorResponse("NOT_FOUND", "Worker not found.");
    if (worker.listing_status !== "listed") return errorResponse("ILLEGAL_TRANSITION", "Worker isn't listed.");
    worker.listing_status = "delisted";
    worker.listed_at = null;
    persist();
    return HttpResponse.json(workerOut(worker));
  }),
];
