import { business } from "@/config/business";
import type { Step } from "./types";

export const familyJourney: readonly Step[] = [
  {
    title: "Post a request",
    body: "Tell us the role, schedule, area, budget and start date. It takes a few minutes.",
  },
  {
    title: "Agencies propose verified workers",
    body: "Registered agencies near you propose workers who have passed all four checks.",
  },
  {
    title: "Review and accept",
    body: "Compare profiles and the date each check was completed, then accept the worker you prefer.",
  },
  {
    title: "Start with a trial",
    body: `Pay the placement fee and the trial begins, usually ${business.trialDaysDefault} days. Confirm when you're happy, or ask for a replacement.`,
  },
];

export const agencyJourney: readonly Step[] = [
  {
    title: "Register your agency",
    body: "Sign up with your business details and CAC registration number. Our team reviews every application.",
  },
  {
    title: "Subscribe and add workers",
    body: "Once approved, start a monthly subscription and add the nannies, drivers and cleaners you represent.",
  },
  {
    title: "Complete the four checks",
    body: "Record identity, guarantor, reference and address checks with evidence. Workers can be listed only when all four are complete.",
  },
  {
    title: "Propose and place",
    body: "See family requests that match your workers, propose the right person and track each placement through trial to confirmation.",
  },
];
