import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentsApi } from "@/features/payments/api";
import { placementsApi } from "@/features/placements/api";
import { familyRequestsApi } from "@/features/requests/family-api";
import type { CreateRequestPayload } from "@/features/requests/schemas";
import { workersApi } from "@/features/workers/api";
import type { ApiError } from "@/lib/api-client";
import { resetAuthState } from "@/test/auth-helpers";
import { signInAsDemo } from "@/test/render";
import { db } from "../db";
import { server } from "../server";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  await signInAsDemo("family@demo.hv");
});
afterAll(() => server.close());

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "OK",
    (e: ApiError) => e.code,
  );
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const newRequest = (overrides: Partial<CreateRequestPayload> = {}): CreateRequestPayload => ({
  role: "cleaner",
  schedule: "part_time",
  live_in: false,
  state: "Lagos",
  lga: "Ikeja",
  start_date: inDays(10),
  trial_days: 14,
  title: "Cleaner three days a week",
  description: "Help with cleaning and laundry for a family of four.",
  budget_min_kobo: null,
  budget_max_kobo: null,
  ...overrides,
});

describe("family requests", () => {
  it("lists only the family's own requests", async () => {
    const { items } = await familyRequestsApi.list(1);
    expect(items.map((r) => r.id).sort()).toEqual(["r-ada-driver", "r-ada-nanny", "r-ada-nanny-2"]);
    expect(await codeOf(familyRequestsApi.get("r-bola-driver"))).toBe("NOT_FOUND");
  });

  it("creates a request, and the family's first request creates their family record", async () => {
    resetAuthState();
    await signInAsDemo("newfamily@demo.hv");
    const created = await familyRequestsApi.create(newRequest());
    expect(created).toMatchObject({ status: "open", proposals_count: 0 });
    expect(db.families.find((f) => f.user_id === "u-newfamily")).toMatchObject({ name: "Ade family", state: "Lagos" });
  });

  it("requires a verified email to post", async () => {
    db.users.find((u) => u.id === "u-family")!.email_verified_at = null;
    expect(await codeOf(familyRequestsApi.create(newRequest()))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("hides withdrawn proposals and shows only the worker's public profile", async () => {
    const proposals = await familyRequestsApi.proposals("r-ada-nanny");
    expect(proposals).toHaveLength(1);
    const worker = proposals[0]!.worker;
    expect(worker).toMatchObject({ first_name: "Amaka", available: true });
    expect(worker.badges).toHaveLength(4);
    expect(JSON.stringify(worker)).not.toMatch(/Obi|nin|7919|phone|address_line/);
  });

  it("cancelling closes the request and declines pending proposals", async () => {
    await familyRequestsApi.cancel("r-ada-nanny");
    expect(db.proposals.find((p) => p.id === "pr-amaka-ada")?.status).toBe("declined");
    expect(await codeOf(familyRequestsApi.cancel("r-ada-nanny"))).toBe("REQUEST_NOT_OPEN");
  });
});

describe("worker public profile", () => {
  it("is visible only to families who received a proposal for the worker", async () => {
    await expect(workersApi.getPublic("w-amaka")).resolves.toMatchObject({ first_name: "Amaka" });
    expect(await codeOf(workersApi.getPublic("w-musa-unknown"))).toBe("NOT_FOUND");
    resetAuthState();
    await signInAsDemo("bola@demo.hv");
    expect(await codeOf(workersApi.getPublic("w-amaka"))).toBe("NOT_FOUND");
  });
});

describe("accept and pay", () => {
  it("accepting creates a 30-minute hold, supersedes other proposals and returns a checkout", async () => {
    db.proposals.push({ ...db.proposals.find((p) => p.id === "pr-amaka-ada")!, id: "pr-other", worker_id: "w-joy" });
    const result = await familyRequestsApi.accept("pr-amaka-ada");
    expect(result.placement.status).toBe("pending_payment");
    expect(result.payment?.authorization_url).toMatch(/^\/demo\/checkout\?reference=HV-PF-/);
    const placement = db.placements.find((p) => p.id === result.placement.id)!;
    const minutes = (Date.parse(placement.hold_expires_at!) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(db.proposals.find((p) => p.id === "pr-other")?.status).toBe("superseded");
    expect(db.requests.find((r) => r.id === "r-ada-nanny")?.status).toBe("matched");
  });

  it("the same Idempotency-Key never creates a second placement", async () => {
    const first = await familyRequestsApi.accept("pr-amaka-ada");
    const again = await familyRequestsApi.accept("pr-amaka-ada");
    expect(again.placement.id).toBe(first.placement.id);
    expect(db.placements.filter((p) => p.worker_id === "w-amaka")).toHaveLength(1);
  });

  it("refuses a worker who was just placed with another family", async () => {
    // Another family's placement for Amaka lands first.
    db.placements.push({
      ...db.placements.find((p) => p.id === "p-grace")!,
      id: "p-race",
      worker_id: "w-amaka",
      status: "trial",
      hold_expires_at: null,
    });
    expect(await codeOf(familyRequestsApi.accept("pr-amaka-ada"))).toBe("WORKER_UNAVAILABLE");
    expect(db.placements.filter((p) => p.worker_id === "w-amaka")).toHaveLength(1);
  });

  it("paying moves the placement to trial; a repeated webhook has no second effect", async () => {
    const { payment, placement } = await familyRequestsApi.accept("pr-amaka-ada");
    await paymentsApi.demoCharge(payment!.reference);
    const paid = await paymentsApi.verify(payment!.reference);
    expect(paid).toMatchObject({ status: "success", placement_status: "trial" });
    const events = () => db.placementEvents.filter((e) => e.placement_id === placement.id).length;
    const before = events();
    await paymentsApi.demoCharge(payment!.reference);
    expect(events()).toBe(before);
  });

  it("a payment after the hold expired is being refunded, raises an alert and creates no placement", async () => {
    const { payment, placement } = await familyRequestsApi.accept("pr-amaka-ada");
    db.placements.find((p) => p.id === placement.id)!.hold_expires_at = new Date(Date.now() - 1000).toISOString();
    await paymentsApi.demoCharge(payment!.reference);
    expect(await paymentsApi.verify(payment!.reference)).toMatchObject({
      status: "refund_pending",
      refund_status: "in_progress",
      placement_status: "cancelled",
    });
    expect(db.requests.find((r) => r.id === "r-ada-nanny")?.status).toBe("open");
    expect(db.alerts.filter((a) => !a.resolved_at).map((a) => a.kind)).toEqual(["late_payment"]);
  });

  it("paying after the hold expired is HOLD_EXPIRED, not a generic refusal", async () => {
    const { placement } = await familyRequestsApi.accept("pr-amaka-ada");
    db.placements.find((p) => p.id === placement.id)!.hold_expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await codeOf(placementsApi.pay(placement.id))).toBe("HOLD_EXPIRED");
  });

  it("only the payer can verify a payment", async () => {
    const { payment } = await familyRequestsApi.accept("pr-amaka-ada");
    resetAuthState();
    await signInAsDemo("bola@demo.hv");
    expect(await codeOf(paymentsApi.verify(payment!.reference))).toBe("NOT_FOUND");
  });

  it("a replacement covered by the free allowance starts the trial with no fee", async () => {
    db.requests.find((r) => r.id === "r-ada-nanny")!.replaces_placement_id = "p-blessing";
    const result = await familyRequestsApi.accept("pr-amaka-ada");
    expect(result.payment).toBeNull();
    expect(result.placement.status).toBe("trial");
  });

  it("can't accept on a request that is no longer open", async () => {
    await familyRequestsApi.accept("pr-amaka-ada");
    db.proposals.push({
      ...db.proposals.find((p) => p.id === "pr-amaka-ada")!,
      id: "pr-late",
      worker_id: "w-joy",
      status: "pending",
    });
    expect(await codeOf(familyRequestsApi.accept("pr-late"))).toBe("REQUEST_NOT_OPEN");
  });
});
