import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verificationApi } from "@/features/verification/api";
import { workersApi } from "@/features/workers/api";
import type { CreateWorkerPayload } from "@/features/workers/schemas";
import type { ApiError } from "@/lib/api-client";
import { resetAuthState } from "@/test/auth-helpers";
import { signInAsDemo } from "@/test/render";
import { db } from "../db";
import { server } from "../server";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  await signInAsDemo("agency@demo.hv");
});
afterAll(() => server.close());

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "OK",
    (e: ApiError) => e.code,
  );

const newWorker = (nin: string): CreateWorkerPayload => ({
  full_name: "Test Worker",
  role: "cleaner",
  years_experience: 2,
  languages: ["English"],
  live_in_ok: false,
  state: "Lagos",
  lga: "Ikeja",
  expected_salary_min_kobo: null,
  expected_salary_max_kobo: null,
  nin,
  consent: true,
});

/**
 * The browser → Cloudinary step can't run under jsdom (its File objects don't survive Node's multipart
 * parser), and it's covered by the e2e tests in a real browser. Here we record the upload the way the
 * Cloudinary intercept does, then exercise what the API owns: registering and validating it.
 */
function fakeUpload(folder: string, overrides: { bytes?: number; format?: string } = {}) {
  const public_id = `${folder}/${crypto.randomUUID()}`;
  db.uploads[public_id] = { public_id, folder, bytes: 2048, format: "pdf", resource_type: "raw", ...overrides };
  return public_id;
}

async function uploadEvidence(workerId: string, kind: "address" | "guarantor") {
  const { api } = await import("@/lib/api-client");
  const public_id = fakeUpload(`workers/docs/${workerId}/${kind}`);
  return api.post(`/workers/${workerId}/verification/${kind}/documents`, { public_id });
}

describe("tenant isolation", () => {
  it("lists only the agency's own workers", async () => {
    const { items } = await workersApi.list({}, 100);
    expect(items.length).toBe(10);
    expect(items.map((w) => w.id)).not.toContain("w-zainab");
  });

  it("returns 404 for another agency's worker and its documents", async () => {
    expect(await codeOf(workersApi.get("w-zainab"))).toBe("NOT_FOUND");
    expect(await codeOf(verificationApi.list("w-zainab"))).toBe("NOT_FOUND");
    const kanoDoc = db.documents.find((d) => d.item_id.startsWith("vi-w-zainab"))!;
    expect(await codeOf(verificationApi.documentUrl(kanoDoc.id))).toBe("NOT_FOUND");
  });
});

describe("listing gate", () => {
  it("refuses to list at 3 of 4, then lists once the last check is verified", async () => {
    expect(await codeOf(workersApi.listWorker("w-joy"))).toBe("WORKER_NOT_VERIFIED");
    await verificationApi.verify("w-joy", "address");
    await expect(workersApi.listWorker("w-joy")).resolves.toMatchObject({ listing_status: "listed" });
  });

  it("refuses when the agency isn't active, even at 4 of 4", async () => {
    db.subscriptions.find((s) => s.agency_id === "a-sunrise")!.status = "past_due";
    await workersApi.delistWorker("w-amaka");
    expect(await codeOf(workersApi.listWorker("w-amaka"))).toBe("AGENCY_NOT_ACTIVE");
  });
});

describe("verification rules", () => {
  it("requires evidence before a check can be verified", async () => {
    expect(await codeOf(verificationApi.verify("w-emeka", "address"))).toBe("ILLEGAL_TRANSITION");
    await verificationApi.saveDetails("w-emeka", "address", { address_line: "3 Broad Street" });
    expect(await codeOf(verificationApi.verify("w-emeka", "address"))).toBe("EVIDENCE_REQUIRED");
    await uploadEvidence("w-emeka", "address");
    await expect(verificationApi.verify("w-emeka", "address")).resolves.toMatchObject({ status: "verified" });
  });

  it("rejecting a verified check delists the worker but doesn't end their placement", async () => {
    await verificationApi.reject("w-blessing", "guarantor", "Guarantor withdrew their support.");
    await expect(workersApi.get("w-blessing")).resolves.toMatchObject({ listing_status: "delisted", available: false });
    expect(db.placements.find((p) => p.id === "p-blessing")?.status).toBe("trial");
  });

  it("a rejection needs a reason", async () => {
    expect(await codeOf(verificationApi.reject("w-joy", "address", "  "))).toBe("VALIDATION_ERROR");
  });

  it("a lapsed check expires on read and delists the worker", async () => {
    db.verificationItems.find((i) => i.id === "vi-w-amaka-references")!.expires_at = new Date(
      Date.now() - 1000,
    ).toISOString();
    const amaka = await workersApi.get("w-amaka");
    expect(amaka.verification.references).toBe("expired");
    expect(amaka.listing_status).toBe("delisted");
  });

  it("new evidence puts a rejected check back in review", async () => {
    await uploadEvidence("w-emeka", "guarantor");
    const items = await verificationApi.list("w-emeka");
    expect(items.find((i) => i.kind === "guarantor")).toMatchObject({ status: "submitted", rejection_reason: null });
  });

  it("only registers uploads from the right folder, format and size", async () => {
    const { api } = await import("@/lib/api-client");
    const register = (kind: string, public_id: string) =>
      codeOf(api.post(`/workers/w-tobi/verification/${kind}/documents`, { public_id }));

    expect(await register("address", fakeUpload("workers/docs/w-tobi/address"))).toBe("OK");
    expect(await register("id", fakeUpload("workers/docs/w-tobi/address"))).toBe("VALIDATION_ERROR");
    expect(await register("id", fakeUpload("workers/docs/w-tobi/id", { format: "gif" }))).toBe("VALIDATION_ERROR");
    expect(await register("id", fakeUpload("workers/docs/w-tobi/id", { bytes: 11 * 1024 * 1024 }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await register("id", "never-uploaded")).toBe("VALIDATION_ERROR");
  });

  it("signs uploads only for the agency's own workers, restricted to the check's folder", async () => {
    const { api } = await import("@/lib/api-client");
    await expect(
      api.post("/uploads/signature", { purpose: "verification_doc", worker_id: "w-tobi", kind: "id" }),
    ).resolves.toMatchObject({ folder: "workers/docs/w-tobi/id", type: "authenticated" });
    expect(
      await codeOf(api.post("/uploads/signature", { purpose: "verification_doc", worker_id: "w-zainab", kind: "id" })),
    ).toBe("NOT_FOUND");
  });
});

describe("workers", () => {
  it("creates a draft worker with four not-started checks and no raw NIN", async () => {
    const created = await workersApi.create(newWorker("12345678901"));
    expect(created).toMatchObject({ listing_status: "draft", verified_count: 0, nin_last4: "8901" });
    expect(Object.values(created.verification)).toEqual(["not_started", "not_started", "not_started", "not_started"]);
    expect(JSON.stringify(db.workers)).not.toContain("12345678901");
  });

  it("rejects a NIN already on the platform, even from another agency", async () => {
    expect(await codeOf(workersApi.create(newWorker("10000087109")))).toBe("DUPLICATE_WORKER"); // Kano's worker
  });

  it("logs every document view", async () => {
    const doc = db.documents.find((d) => d.item_id === "vi-w-amaka-id")!;
    const before = db.accessLog.length;
    await expect(verificationApi.documentUrl(doc.id)).resolves.toHaveProperty("url");
    expect(db.accessLog).toHaveLength(before + 1);
  });

  it("never gives families a document URL", async () => {
    resetAuthState();
    await signInAsDemo("family@demo.hv");
    const doc = db.documents.find((d) => d.item_id === "vi-w-amaka-id")!;
    expect(await codeOf(verificationApi.documentUrl(doc.id))).toBe("NOT_FOUND");
  });
});
