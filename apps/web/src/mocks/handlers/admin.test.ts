import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminApi } from "@/features/admin/api";
import { agenciesApi } from "@/features/agencies/api";
import { familyRequestsApi } from "@/features/requests/family-api";
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

/** Switch user, keeping the mock database (resetAuthState would reset it to the seed). */
const as = (email: string) => signInAsDemo(email);

describe("admin access", () => {
  it.each(["family@demo.hv", "agency@demo.hv"])("%s gets FORBIDDEN on admin endpoints", async (email) => {
    await as(email);
    expect(await codeOf(adminApi.overview())).toBe("FORBIDDEN");
    expect(await codeOf(adminApi.agencies("all", 1))).toBe("FORBIDDEN");
    expect(await codeOf(adminApi.agencyAction("a-brighthands", "approve"))).toBe("FORBIDDEN");
  });
});

describe("overview and agencies", () => {
  it("counts what needs attention", async () => {
    const o = await adminApi.overview();
    expect(o.agencies_pending).toBe(1);
    expect(o.pending_agencies.map((a) => a.id)).toEqual(["a-brighthands"]);
    expect(o.placements_active).toBe(3);
    expect(o.recent_audit[0]).toMatchObject({ action: "agency.suspended", entity_label: "Harbour Care Services" });
  });

  it("lists pending agencies first and filters by status", async () => {
    const all = await adminApi.agencies("all", 1);
    expect(all.items[0]?.id).toBe("a-brighthands");
    expect(all.total).toBe(4);
    expect((await adminApi.agencies("suspended", 1)).items.map((a) => a.id)).toEqual(["a-harbour"]);
  });

  it("offers the actions each status allows", async () => {
    expect((await adminApi.agency("a-brighthands")).allowed_actions).toEqual(["approve", "reject"]);
    expect((await adminApi.agency("a-sunrise")).allowed_actions).toEqual(["suspend"]);
    expect((await adminApi.agency("a-harbour")).allowed_actions).toEqual(["reinstate"]);
    expect(await codeOf(adminApi.agency("a-nope"))).toBe("NOT_FOUND");
  });
});

describe("agency status changes", () => {
  it("approving lets the agency list workers and records it", async () => {
    const approved = await adminApi.agencyAction("a-brighthands", "approve");
    expect(approved).toMatchObject({ status: "approved", allowed_actions: ["suspend"] });
    expect(approved.approved_at).not.toBeNull();
    expect(approved.history[0]).toMatchObject({ action: "agency.approved", actor: { name: "HelpVerified Admin" } });
    // A second approve (another admin acting at the same time) is refused, not repeated.
    expect(await codeOf(adminApi.agencyAction("a-brighthands", "approve"))).toBe("ILLEGAL_TRANSITION");
  });

  it("rejecting and suspending need a reason the agency can see", async () => {
    expect(await codeOf(adminApi.agencyAction("a-brighthands", "reject"))).toBe("VALIDATION_ERROR");
    await adminApi.agencyAction("a-brighthands", "reject", "CAC number doesn't match the business name.");
    await as("pending@demo.hv");
    const dashboard = await agenciesApi.dashboard();
    expect(dashboard.agency).toMatchObject({
      status: "rejected",
      status_reason: "CAC number doesn't match the business name.",
    });
  });

  it("rejected is final", async () => {
    await adminApi.agencyAction("a-brighthands", "reject", "Duplicate application.");
    expect((await adminApi.agency("a-brighthands")).allowed_actions).toEqual([]);
    expect(await codeOf(adminApi.agencyAction("a-brighthands", "approve"))).toBe("ILLEGAL_TRANSITION");
  });

  it("suspending hides listed workers and withdraws proposals but keeps placements running", async () => {
    const before = await adminApi.agency("a-sunrise");
    expect(before.workers.listed).toBeGreaterThan(0);
    const suspended = await adminApi.agencyAction("a-sunrise", "suspend", "Complaints under investigation.");
    expect(suspended.workers.listed).toBe(0);
    expect(suspended.workers.suspended).toBe(before.workers.listed);
    expect(suspended.active_placements).toBe(before.active_placements);

    expect(db.proposals.filter((p) => p.agency_id === "a-sunrise" && p.status === "pending")).toHaveLength(0);
    expect(db.placements.find((p) => p.id === "p-blessing")?.status).toBe("trial");

    // The family no longer sees Amaka's proposal.
    await as("family@demo.hv");
    expect(await familyRequestsApi.proposals("r-ada-nanny")).toEqual([]);

    // And the agency can't list or propose.
    await as("agency@demo.hv");
    expect(await codeOf(workersApi.listWorker("w-joy"))).toBe("AGENCY_NOT_ACTIVE");
  });

  it("reinstating doesn't relist: the agency relists through the gate", async () => {
    await adminApi.agencyAction("a-sunrise", "suspend", "Complaints under investigation.");
    const reinstated = await adminApi.agencyAction("a-sunrise", "reinstate");
    expect(reinstated).toMatchObject({ status: "approved", status_reason: null });
    expect(reinstated.workers.listed).toBe(0);
    expect(reinstated.workers.suspended).toBe(0);
    await as("agency@demo.hv");
    expect((await workersApi.listWorker("w-amaka")).listing_status).toBe("listed");
  });
});
