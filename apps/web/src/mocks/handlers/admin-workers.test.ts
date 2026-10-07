import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminApi } from "@/features/admin/api";
import { placementsApi } from "@/features/placements/api";
import { verificationApi } from "@/features/verification/api";
import { workersApi } from "@/features/workers/api";
import type { ApiError } from "@/lib/api-client";
import { resetAuthState } from "@/test/auth-helpers";
import { signInAsDemo } from "@/test/render";
import { db } from "../db";
import { server } from "../server";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  await signInAsDemo("admin@demo.hv");
});
afterAll(() => server.close());

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "OK",
    (e: ApiError) => e.code,
  );
/** Switch user, keeping the mock database. */
const as = (email: string) => signInAsDemo(email);

describe("admin workers", () => {
  it("lists workers across agencies with filters", async () => {
    const all = await adminApi.workers({ page: 1 });
    expect(new Set(all.items.map((w) => w.agency.id))).toEqual(new Set(["a-sunrise", "a-kano"]));
    const kano = await adminApi.workers({ page: 1, agency_id: "a-kano" });
    expect(kano.items.every((w) => w.agency.name === "Kano Home Helpers")).toBe(true);
    const listedDrivers = await adminApi.workers({ page: 1, role: "driver", listing_status: "listed" });
    expect(listedDrivers.items.every((w) => w.role === "driver" && w.listing_status === "listed")).toBe(true);
  });

  it("shows one worker's checks with document metadata but no URLs", async () => {
    const w = await adminApi.worker("w-amaka");
    expect(w.checks).toHaveLength(4);
    expect(JSON.stringify(w)).not.toMatch(/https?:|data:/);
    expect(await codeOf(adminApi.worker("w-nope"))).toBe("NOT_FOUND");
  });

  it("is admins only", async () => {
    await as("agency@demo.hv");
    expect(await codeOf(adminApi.workers({ page: 1 }))).toBe("FORBIDDEN");
    expect(await codeOf(adminApi.flag("w-amaka", "address", "Looks wrong"))).toBe("FORBIDDEN");
  });
});

describe("flagging a check", () => {
  it("needs a reason and only applies to verified checks", async () => {
    expect(await codeOf(adminApi.flag("w-amaka", "address", ""))).toBe("VALIDATION_ERROR");
    await adminApi.flag("w-amaka", "address", "Utility bill is for a different street.");
    expect(await codeOf(adminApi.flag("w-amaka", "address", "Again please"))).toBe("ILLEGAL_TRANSITION");
  });

  it("delists the worker, records it, and the agency sees the reason", async () => {
    const flagged = await adminApi.flag("w-amaka", "address", "Utility bill is for a different street.");
    expect(flagged.listing_status).toBe("delisted");
    expect(flagged.verified_count).toBe(3);
    expect(flagged.checks.find((c) => c.kind === "address")).toMatchObject({
      status: "submitted",
      flag_reason: "Utility bill is for a different street.",
    });
    expect(db.auditLog[0]).toMatchObject({ action: "worker.check_flagged", entity_id: "w-amaka" });

    await as("agency@demo.hv");
    const items = await verificationApi.list("w-amaka");
    expect(items.find((i) => i.kind === "address")?.flag_reason).toBe("Utility bill is for a different street.");
    // Listing is refused until the check is verified again (rule 1).
    expect(await codeOf(workersApi.listWorker("w-amaka"))).toBe("WORKER_NOT_VERIFIED");
    // Re-verifying clears the flag, and the worker can be listed.
    await verificationApi.verify("w-amaka", "address");
    expect((await verificationApi.list("w-amaka")).find((i) => i.kind === "address")?.flag_reason).toBeNull();
    expect((await workersApi.listWorker("w-amaka")).listing_status).toBe("listed");
  });

  it("doesn't end a running placement", async () => {
    await adminApi.flag("w-blessing", "references", "Referee's number doesn't connect.");
    expect(db.placements.find((p) => p.id === "p-blessing")?.status).toBe("trial");
  });
});

describe("documents and placements", () => {
  it("viewing a document writes the audit log", async () => {
    const doc = (await adminApi.worker("w-amaka")).checks.find((c) => c.documents.length > 0)!.documents[0]!;
    await verificationApi.documentUrl(doc.id);
    expect(db.auditLog[0]).toMatchObject({ action: "document.viewed", data: { worker_id: "w-amaka" } });
  });

  it("an admin can end a placement; it's recorded as ended by HelpVerified and audited", async () => {
    const p = await placementsApi.get("p-blessing");
    expect(p.allowed_actions).toEqual(["end"]);
    const ended = await placementsApi.end("p-blessing", "Safeguarding concern reported to us.");
    expect(ended).toMatchObject({ status: "ended", end_reason: "admin_ended" });
    expect(db.auditLog[0]).toMatchObject({ action: "placement.ended", entity_id: "p-blessing" });
  });

  it("the audit log filters by action and pages", async () => {
    const suspended = await adminApi.audit("agency.suspended", 1);
    expect(suspended.items.map((e) => e.entity_label)).toEqual(["Harbour Care Services"]);
    const all = await adminApi.audit(undefined, 1);
    expect(all.total).toBe(db.auditLog.length);
  });
});
