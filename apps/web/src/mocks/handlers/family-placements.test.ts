import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familiesApi } from "@/features/families/api";
import { placementsApi } from "@/features/placements/api";
import { familyRequestsApi } from "@/features/requests/family-api";
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
const DAY = 86_400_000;

async function asBola() {
  resetAuthState();
  await signInAsDemo("bola@demo.hv");
}

describe("family placement actions", () => {
  it("offers the family the actions for each status", async () => {
    expect((await placementsApi.get("p-blessing")).allowed_actions).toEqual(["confirm", "request_replacement", "end"]);
    expect((await placementsApi.get("p-musa")).allowed_actions).toEqual([]);
    await asBola();
    expect((await placementsApi.get("p-grace")).allowed_actions).toEqual(["pay", "cancel"]);
    expect((await placementsApi.get("p-chinedu")).allowed_actions).toEqual(["request_replacement", "end"]);
  });

  it("confirms a placement on trial, and only once", async () => {
    const confirmed = await placementsApi.confirm("p-blessing");
    expect(confirmed).toMatchObject({ status: "confirmed", allowed_actions: ["request_replacement", "end"] });
    expect(confirmed.confirmed_at).not.toBeNull();
    expect(await codeOf(placementsApi.confirm("p-blessing"))).toBe("ILLEGAL_TRANSITION");
  });

  it("can't act on another family's placement", async () => {
    expect(await codeOf(placementsApi.confirm("p-chinedu"))).toBe("NOT_FOUND");
    expect(await codeOf(placementsApi.requestReplacement("p-chinedu", "Not a good fit"))).toBe("NOT_FOUND");
  });

  it("cancelling an unpaid hold releases the worker and reopens the request", async () => {
    await asBola();
    expect(await codeOf(placementsApi.cancel("p-grace", ""))).toBe("VALIDATION_ERROR");
    const cancelled = await placementsApi.cancel("p-grace", "We found help elsewhere");
    expect(cancelled).toMatchObject({ status: "cancelled", allowed_actions: [] });
    expect((await familyRequestsApi.get("r-bola-cleaner-2")).status).toBe("open");
    expect(db.payments.find((p) => p.id === "pf-grace")?.status).toBe("failed");
    // The worker can be proposed again: no active placement remains.
    expect(
      db.placements.some((p) => p.worker_id === "w-grace" && p.status !== "cancelled" && p.status !== "ended"),
    ).toBe(false);
  });

  it("resumes checkout for an unpaid hold", async () => {
    await asBola();
    const { authorization_url, reference } = await placementsApi.pay("p-grace");
    expect(authorization_url).toBe(`/demo/checkout?reference=${reference}`);
    expect(await codeOf(placementsApi.pay("p-chinedu"))).toBe("ILLEGAL_TRANSITION");
  });

  it("a replacement during the trial ends the placement and opens a linked request", async () => {
    expect(await codeOf(placementsApi.requestReplacement("p-blessing", "no"))).toBe("VALIDATION_ERROR");
    const { placement, new_request } = await placementsApi.requestReplacement(
      "p-blessing",
      "Not comfortable with infants",
    );
    expect(placement).toMatchObject({ status: "ended", end_reason: "replaced", replacements_used: 1 });
    const replacement = await familyRequestsApi.get(new_request.id);
    expect(replacement).toMatchObject({ status: "open", role: "nanny", replaces_placement_id: "p-blessing" });
    expect((await familyRequestsApi.get("r-ada-nanny-2")).status).toBe("closed");
    expect(db.replacementRequests).toHaveLength(1);
  });

  it("allows a replacement within the window after confirming, not after", async () => {
    await asBola();
    db.placements.find((p) => p.id === "p-chinedu")!.confirmed_at = new Date(Date.now() - 31 * DAY).toISOString();
    expect((await placementsApi.get("p-chinedu")).allowed_actions).toEqual(["end"]);
    expect(await codeOf(placementsApi.requestReplacement("p-chinedu", "Moved house"))).toBe(
      "REPLACEMENT_WINDOW_CLOSED",
    );
  });

  it("accepting a proposal on the replacement request waives the fee", async () => {
    const { new_request } = await placementsApi.requestReplacement("p-blessing", "Not comfortable with infants");
    // Stand in for an agency proposing Amaka on the new request.
    db.proposals.push({
      ...db.proposals.find((p) => p.id === "pr-amaka-ada")!,
      id: "pr-amaka-repl",
      request_id: new_request.id,
    });
    db.proposals.find((p) => p.id === "pr-amaka-ada")!.status = "withdrawn";
    const result = await familyRequestsApi.accept("pr-amaka-repl");
    expect(result.payment).toBeNull();
    expect(result.placement.status).toBe("trial");
  });
});

describe("family dashboard and profile", () => {
  it("shows active placements and open requests", async () => {
    const dashboard = await familiesApi.dashboard();
    expect(dashboard.active_placements.map((p) => p.id)).toEqual(["p-blessing"]);
    expect(dashboard.open_requests.map((r) => r.id)).toEqual(["r-ada-nanny"]);
  });

  it("returns the family profile, or null before the first request", async () => {
    expect(await familiesApi.profile()).toMatchObject({ id: "f-ada", state: "Lagos" });
    resetAuthState();
    await signInAsDemo("newfamily@demo.hv");
    expect(await familiesApi.profile()).toBeNull();
  });

  it("is families only", async () => {
    resetAuthState();
    await signInAsDemo("agency@demo.hv");
    expect(await codeOf(familiesApi.dashboard())).toBe("FORBIDDEN");
  });
});
