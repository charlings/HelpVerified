import { describe, expect, it } from "vitest";
import { listingDecision } from "./listing";
import type { Worker } from "./types";

const worker = (overrides: Partial<Worker> = {}): Worker => ({
  id: "w",
  full_name: "Test",
  role: "nanny",
  years_experience: 1,
  languages: ["English"],
  live_in_ok: false,
  state: "Lagos",
  lga: "Ikeja",
  expected_salary_min_kobo: null,
  expected_salary_max_kobo: null,
  photo_url: null,
  nin_last4: "1234",
  listing_status: "draft",
  listed_at: null,
  available: true,
  active_placement: null,
  verification: { id: "verified", guarantor: "verified", references: "verified", address: "verified" },
  verified_count: 4,
  created_at: "",
  ...overrides,
});

describe("listingDecision", () => {
  it("allows listing at 4 of 4 for an active agency", () => {
    expect(listingDecision(worker(), true)).toEqual({ canList: true });
  });

  it("names the checks still outstanding, in checklist order", () => {
    const decision = listingDecision(
      worker({ verification: { id: "verified", guarantor: "submitted", references: "verified", address: "rejected" } }),
      true,
    );
    expect(decision).toEqual({ canList: false, reason: "2 checks still to verify: Guarantor, Address." });
  });

  it("uses the singular for one check", () => {
    const decision = listingDecision(
      worker({ verification: { id: "verified", guarantor: "verified", references: "expired", address: "verified" } }),
      true,
    );
    expect(decision).toMatchObject({ reason: "1 check still to verify: References." });
  });

  it("explains an inactive agency once all checks are done", () => {
    expect(listingDecision(worker(), false)).toMatchObject({
      canList: false,
      reason: expect.stringMatching(/approved and subscribed/),
    });
  });

  it("blocks suspended workers", () => {
    expect(listingDecision(worker({ listing_status: "suspended" }), true)).toMatchObject({ canList: false });
  });
});
