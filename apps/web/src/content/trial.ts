import { business } from "@/config/business";

const replacements =
  business.freeReplacements === 1 ? "one free replacement" : `${business.freeReplacements} free replacements`;

// TODO(content): trial length, replacement window and free replacements are defaults awaiting owner confirmation.
export const trialPromise = {
  eyebrow: "Our promise",
  title: "Start with a trial. Change your mind if it isn't right.",
  points: [
    {
      title: `A ${business.trialDaysDefault}-day trial`,
      body: `Every placement starts with a trial, usually ${business.trialDaysDefault} days. You can set anywhere from ${business.trialDaysMin} to ${business.trialDaysMax} days when you post your request.`,
    },
    {
      title: "Replacement if it doesn't work out",
      body: `Ask for a replacement during the trial or within ${business.replacementWindowDays} days of confirming. Your placement fee covers ${replacements}.`,
    },
    {
      title: "One worker, one family",
      body: "A worker can only be placed with one family at a time, so nobody is double-booked.",
    },
  ],
} as const;
