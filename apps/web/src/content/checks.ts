import { business } from "@/config/business";
import type { Check } from "./types";

// TODO(content): confirm how agencies carry out each check, so the wording matches practice.
export const checks: readonly Check[] = [
  {
    kind: "id",
    title: "Identity",
    body: "The agency checks a government-issued ID and the worker's National Identification Number.",
  },
  {
    kind: "guarantor",
    title: "Guarantor",
    body: "A named guarantor is contacted and agrees to stand for the worker.",
  },
  {
    kind: "references",
    title: "References",
    body: `Previous employers are contacted about the worker's conduct and reliability. Re-checked every ${business.recheckMonths} months.`,
  },
  {
    kind: "address",
    title: "Address",
    body: `The worker's home address is confirmed with proof of residence. Re-checked every ${business.recheckMonths} months.`,
  },
];

export const checksIntro = {
  eyebrow: "What we check",
  title: "Four checks. All of them, every time.",
  body: "A worker can only be proposed to your family once the agency has completed and recorded all four checks. If any check lapses or fails, the worker is taken off the platform until it is fixed.",
} as const;
