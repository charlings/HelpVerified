import { describe, expect, it } from "vitest";
import type { PlacementStatus } from "@/types/domain";
import { allowedActions, canTransition, transitions } from "./state-machine";
import { placementAction, placementStatus } from "./status";

const statuses = Object.keys(transitions) as PlacementStatus[];
const allowed: [PlacementStatus, PlacementStatus][] = [
  ["pending_payment", "trial"],
  ["pending_payment", "cancelled"],
  ["trial", "confirmed"],
  ["trial", "ended"],
  ["confirmed", "ended"],
];

describe("placement transitions", () => {
  it.each(allowed)("%s → %s is allowed", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const disallowed = statuses.flatMap((from) =>
    statuses.filter((to) => !allowed.some(([f, t]) => f === from && t === to)).map((to) => [from, to] as const),
  );
  it.each(disallowed)("%s → %s is rejected", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("ended and cancelled are terminal", () => {
    expect(transitions.ended).toEqual([]);
    expect(transitions.cancelled).toEqual([]);
  });
});

describe("allowed actions", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const ctx = (status: PlacementStatus, confirmedDaysAgo: number | null = null) => ({
    status,
    confirmedAt: confirmedDaysAgo === null ? null : new Date(now - confirmedDaysAgo * 86_400_000).toISOString(),
    replacementWindowDays: 30,
    now,
  });

  it.each([
    ["pending_payment", null, ["pay", "cancel"]],
    ["trial", null, ["confirm", "request_replacement", "end"]],
    ["confirmed", 10, ["request_replacement", "end"]],
    ["confirmed", 31, ["end"]],
    ["ended", null, []],
    ["cancelled", null, []],
  ] as const)("family, %s (confirmed %s days ago) → %j", (status, days, expected) => {
    expect(allowedActions("family", ctx(status, days))).toEqual(expected);
  });

  it.each(statuses)("agency, %s", (status) => {
    const expected = status === "trial" || status === "confirmed" ? ["end"] : [];
    expect(allowedActions("agency_admin", ctx(status, 5))).toEqual(expected);
  });

  it("every status and action has a label", () => {
    for (const s of statuses) expect(placementStatus[s].label).toBeTruthy();
    for (const a of ["pay", "cancel", "confirm", "request_replacement", "end"] as const) {
      expect(placementAction[a].label).toBeTruthy();
    }
  });
});
