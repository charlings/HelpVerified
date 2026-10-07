import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { placementsApi } from "@/features/placements/api";
import { requestsApi } from "@/features/requests/api";
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

describe("requests an agency can see", () => {
  it("lists open requests for its roles in its state only", async () => {
    const { items } = await requestsApi.list(1);
    expect(items.map((r) => r.id).sort()).toEqual(["r-ada-nanny", "r-bola-cleaner", "r-bola-driver"]);
    expect(items.find((r) => r.id === "r-ada-nanny")?.my_proposals).toBe(1);
  });

  it("hides other states' requests and never shows family names", async () => {
    expect(await codeOf(requestsApi.get("r-ifeoma-cleaner"))).toBe("NOT_FOUND");
    const request = await requestsApi.get("r-ada-nanny");
    expect(JSON.stringify(request)).not.toMatch(/Okafor/);
  });

  it("shows another agency only its own proposals", async () => {
    resetAuthState();
    await signInAsDemo("kano@demo.hv");
    expect(await codeOf(requestsApi.proposals("r-ada-nanny"))).toBe("NOT_FOUND");
  });
});

describe("proposing", () => {
  it("never offers a worker who is already in an active placement", async () => {
    expect(await codeOf(requestsApi.propose("r-bola-driver", "w-chinedu", ""))).toBe("WORKER_UNAVAILABLE"); // confirmed
    expect(await codeOf(requestsApi.propose("r-ada-nanny", "w-blessing", ""))).toBe("WORKER_UNAVAILABLE"); // on trial
    expect(await codeOf(requestsApi.propose("r-bola-cleaner", "w-grace", ""))).toBe("WORKER_UNAVAILABLE"); // pending payment
  });

  it("only offers listed workers of the requested role", async () => {
    expect(await codeOf(requestsApi.propose("r-ada-nanny", "w-joy", ""))).toBe("WORKER_NOT_LISTED");
    expect(await codeOf(requestsApi.propose("r-ada-nanny", "w-musa", ""))).toBe("VALIDATION_ERROR");
    expect(await codeOf(requestsApi.propose("r-ada-nanny", "w-zainab", ""))).toBe("VALIDATION_ERROR"); // Kano's
  });

  it("blocks duplicates but allows re-proposing after a withdrawal", async () => {
    expect(await codeOf(requestsApi.propose("r-ada-nanny", "w-amaka", ""))).toBe("ALREADY_PROPOSED");
    await requestsApi.withdraw("pr-amaka-ada");
    await expect(requestsApi.propose("r-ada-nanny", "w-amaka", "Still available")).resolves.toMatchObject({
      status: "pending",
      note: "Still available",
    });
  });

  it("creates a pending proposal", async () => {
    await expect(requestsApi.propose("r-bola-driver", "w-musa", "Nine years driving families")).resolves.toMatchObject({
      status: "pending",
      worker: { full_name: "Musa Ibrahim" },
    });
  });

  it("refuses closed requests and inactive agencies", async () => {
    expect(await codeOf(requestsApi.propose("r-ada-nanny-2", "w-amaka", ""))).toBe("REQUEST_NOT_OPEN");
    db.subscriptions.find((s) => s.agency_id === "a-sunrise")!.status = "cancelled";
    expect(await codeOf(requestsApi.propose("r-bola-driver", "w-musa", ""))).toBe("AGENCY_NOT_ACTIVE");
  });

  it("only withdraws pending proposals", async () => {
    expect(await codeOf(requestsApi.withdraw("pr-blessing"))).toBe("ILLEGAL_TRANSITION");
  });
});

describe("placements", () => {
  it("shows an agency only its own placements, each party only theirs", async () => {
    const { items } = await placementsApi.list({});
    expect(items.map((p) => p.id).sort()).toEqual(["p-blessing", "p-chinedu", "p-grace", "p-musa"]);
    resetAuthState();
    await signInAsDemo("kano@demo.hv");
    expect((await placementsApi.list({})).total).toBe(0);
    expect(await codeOf(placementsApi.get("p-blessing"))).toBe("NOT_FOUND");
    resetAuthState();
    await signInAsDemo("ifeoma@demo.hv");
    expect(await codeOf(placementsApi.get("p-blessing"))).toBe("NOT_FOUND");
  });

  it("computes allowed actions per role and state", async () => {
    expect((await placementsApi.get("p-blessing")).allowed_actions).toEqual(["end"]);
    expect((await placementsApi.get("p-grace")).allowed_actions).toEqual([]);
    resetAuthState();
    await signInAsDemo("family@demo.hv");
    expect((await placementsApi.get("p-blessing")).allowed_actions).toEqual(["confirm", "request_replacement", "end"]);
  });

  it("ending a trial records the reason and frees the worker", async () => {
    const ended = await placementsApi.end("p-blessing", "The family is relocating abroad.");
    expect(ended).toMatchObject({ status: "ended", end_reason: "agency_ended", allowed_actions: [] });
    expect(ended.events.at(-1)).toMatchObject({
      from: "trial",
      to: "ended",
      actor: "agency",
      reason: "The family is relocating abroad.",
    });
    await expect(requestsApi.propose("r-ada-nanny", "w-blessing", "")).resolves.toMatchObject({ status: "pending" });
  });

  it("can't end a placement twice, or without a reason", async () => {
    expect(await codeOf(placementsApi.end("p-blessing", "  "))).toBe("VALIDATION_ERROR");
    expect(await codeOf(placementsApi.end("p-musa", "Already ended long ago."))).toBe("ILLEGAL_TRANSITION");
  });

  it("cancels an unpaid hold once it expires and reopens the request", async () => {
    db.placements.find((p) => p.id === "p-grace")!.hold_expires_at = new Date(Date.now() - 1000).toISOString();
    const grace = await placementsApi.get("p-grace");
    expect(grace).toMatchObject({ status: "cancelled", end_reason: "payment_expired" });
    expect(grace.events.at(-1)).toMatchObject({ to: "cancelled", actor: "system" });
    expect(db.requests.find((r) => r.id === "r-bola-cleaner-2")?.status).toBe("open");
  });
});
