import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex } from "./contrast";

describe("contrastRatio", () => {
  it("returns 21 for black on white and 1 for identical colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#0158e1", "#0158e1")).toBe(1);
  });

  it("matches the documented brand ratios against white", () => {
    expect(contrastRatio("#0158e1", "#ffffff")).toBeCloseTo(6.03, 1);
    expect(contrastRatio("#475569", "#ffffff")).toBeCloseTo(7.58, 1);
    expect(contrastRatio("#0a2249", "#ffffff")).toBeCloseTo(15.7, 0);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#ffffff", "#0158e1")).toBe(contrastRatio("#0158e1", "#ffffff"));
  });

  it("accepts the 3-digit shorthand produced by CSS minification", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(contrastRatio("#0158e1", "#fff")).toBe(contrastRatio("#0158e1", "#ffffff"));
  });

  it("rejects malformed input", () => {
    expect(() => parseHex("blue")).toThrow();
  });
});
