/**
 * M8 decision 7: every semantic colour pairing the UI uses meets WCAG contrast. Values are read from
 * tokens.css, so changing a token re-checks every pairing. Text: 4.5:1. Large text (≥ 24 px, or
 * ≥ 18.7 px bold) and UI parts such as the focus ring: 3:1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex } from "@/lib/contrast";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");
const tokens = Object.fromEntries(
  [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{3,6})\b/gi)].map((m) => [m[1]!, m[2]!]),
);
const c = (name: string) => {
  const value = tokens[name];
  if (!value) throw new Error(`No colour token --color-${name}`);
  return value;
};

/** `top` at `alpha` over `bottom`, as the eye sees it (sRGB blend, as browsers do). */
function over(top: string, alpha: number, bottom: string) {
  const [a, b] = [parseHex(top), parseHex(bottom)];
  const mixed = a.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const TEXT = 4.5;
const LARGE = 3;

describe("text on surfaces", () => {
  it.each([
    ["headings (navy) on white", "navy-900", "white", TEXT],
    ["body (slate-600) on white", "slate-600", "white", TEXT],
    ["body on the muted surface", "slate-600", "slate-50", TEXT],
    ["muted text (slate-500) on white", "slate-500", "white", TEXT],
    ["muted text on the muted surface", "slate-500", "slate-50", TEXT],
    ["links and primary (blue-600) on white", "blue-600", "white", TEXT],
    ["links on the muted surface", "blue-600", "slate-50", TEXT],
    ["links on the page tint (blue-50)", "blue-600", "blue-50", TEXT],
    ["white on primary buttons", "white", "blue-600", TEXT],
    ["white on hover/pressed", "white", "blue-700", TEXT],
    ["white on navy (sidebar, CTA)", "white", "navy-900", TEXT],
    ["field error text (danger-600) on white", "danger-600", "white", TEXT],
    ["blue-500 is large text only", "blue-500", "white", LARGE],
  ])("%s", (_label, fg, bg, min) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(min);
  });
});

describe("badges and alerts (text on their tinted background)", () => {
  it.each([
    ["neutral badge", "slate-700", "slate-100"],
    ["info badge and alert", "blue-700", "blue-50"],
    ["success badge and alert", "success-600", "success-50"],
    ["warning badge and alert", "warning-700", "warning-50"],
    ["danger badge and alert", "danger-700", "danger-50"],
  ])("%s", (_label, fg, bg) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(TEXT);
  });

  it("verified badge: navy on both ends of the verified gradient", () => {
    // --color-on-verified is var(--color-navy-900).
    expect(contrastRatio(c("navy-900"), c("yellow-300"))).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(c("navy-900"), c("amber-400"))).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("text over gradients", () => {
  it("auth promo headline: white over the darker part of the panel gradient it sits on (large text)", () => {
    // The headline sits in the top 45% of a 150° gradient: #0047b8 → #0158e1 (55%). Cyan is under the photo.
    expect(contrastRatio(c("white"), c("blue-700"))).toBeGreaterThanOrEqual(LARGE);
    expect(contrastRatio(c("white"), c("blue-600"))).toBeGreaterThanOrEqual(LARGE);
  });

  it("CTA banner: white/80 body text stays readable where the brand glow overlaps the navy box", () => {
    // Worst case: the glow's cyan end at the CTA's glow opacity over navy, under 80% white text.
    const glowOpacity = Number(/bg-\(image:--gradient-brand\) opacity-(\d+)/.exec(readCta())![1]) / 100;
    const background = over(c("cyan-400"), glowOpacity, c("navy-900"));
    const text = over(c("white"), 0.8, background);
    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("focus ring", () => {
  it("blue-600 ring is visible against white, and its white inner ring against navy", () => {
    expect(contrastRatio(c("blue-600"), c("white"))).toBeGreaterThanOrEqual(LARGE);
    expect(contrastRatio(c("white"), c("navy-900"))).toBeGreaterThanOrEqual(LARGE);
  });
});

function readCta() {
  return readFileSync(join(__dirname, "../features/marketing/components/CtaBanner.tsx"), "utf8");
}
