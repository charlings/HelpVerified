import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");
const colours = Object.fromEntries(
  [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, hex]) => [name!, hex!]),
);

function c(name: string): string {
  const hex = colours[name];
  if (!hex) throw new Error(`Token --color-${name} not found`);
  return hex;
}

// Every text/background pairing the components use. Text must meet WCAG AA (4.5:1).
const textPairs: [string, string, string][] = [
  ["body text", "slate-600", "white"],
  ["muted text / placeholder", "slate-500", "white"],
  ["headings", "navy-900", "white"],
  ["links, primary on white", "blue-600", "white"],
  ["primary button", "white", "blue-600"],
  ["primary button hover", "white", "blue-700"],
  ["verified badge", "navy-900", "amber-400"],
  ["neutral badge", "slate-700", "slate-100"],
  ["info badge / alert", "blue-700", "blue-50"],
  ["success badge / alert", "success-600", "success-50"],
  ["warning badge / alert", "warning-700", "warning-50"],
  ["danger badge / alert", "danger-700", "danger-50"],
  ["field error text", "danger-600", "white"],
  ["auth page text", "slate-600", "blue-50"],
];

describe("design tokens", () => {
  it.each(textPairs)("%s meets AA (%s on %s)", (_label, fg, bg) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps blue-500 out of small text (below AA on white)", () => {
    expect(contrastRatio(c("blue-500"), c("white"))).toBeLessThan(4.5);
  });
});
