import { business } from "@/config/business";
import type { ServiceSlug } from "@/config/routes";
import type { Faq, Service } from "./types";

const sharedFaqs: readonly Faq[] = [
  {
    question: "Who carries out the checks?",
    answer:
      "The registered agency that recruits the worker. HelpVerified approves each agency before it can join, records every check, and only lets a worker be proposed once all four are complete.",
  },
  {
    question: "What happens if it doesn't work out?",
    answer: `You can request a replacement during the trial or within ${business.replacementWindowDays} days of confirming the placement. A new request opens with the same details so agencies can propose someone else.`,
  },
  {
    // TODO(content): confirm the employment relationship (who employs and pays the worker) before launch.
    question: "Who employs the worker?",
    answer:
      "The worker is recruited and vetted by the agency. Salary and employment terms are agreed between your family, the worker and the agency when the placement is confirmed.",
  },
];

// TODO(content): review duties and summaries for each role.
export const services: Record<ServiceSlug, Service> = {
  nanny: {
    slug: "nanny",
    name: "Nanny",
    plural: "Nannies",
    summary: "Day-to-day childcare from someone whose background has been checked.",
    intro:
      "Find a nanny for full-time or part-time care, live-in or live-out. Every nanny you see has passed identity, guarantor, reference and address checks with a registered agency.",
    duties: [
      "Daily care routines: feeding, bathing, naps and play",
      "Preparing children's meals and keeping their spaces tidy",
      "School pick-ups, homework support and bedtime routines",
    ],
    image: "nanny",
    faqs: [
      {
        question: "Can I hire a live-in nanny?",
        answer:
          "Yes. When you post your request, say whether you need live-in or live-out care. Agencies only propose nannies who are open to that arrangement.",
      },
      ...sharedFaqs,
    ],
  },
  driver: {
    slug: "driver",
    name: "Driver",
    plural: "Drivers",
    summary: "A reliable driver for school runs, commutes and errands.",
    intro:
      "Hire a family or personal driver who has been checked by a registered agency. Every driver has passed identity, guarantor, reference and address checks before you see their profile.",
    duties: [
      "School runs, work commutes and family trips",
      "Routine vehicle care: cleaning, fuel and service reminders",
      "Errands and deliveries on your schedule",
    ],
    image: "driver",
    faqs: [
      {
        // TODO(content): confirm whether driving licences are checked, and by whom.
        question: "Is the driver's licence checked?",
        answer:
          "Licence checks are arranged by the agency. Ask the agency about licence history before you accept a proposal.",
      },
      ...sharedFaqs,
    ],
  },
  cleaner: {
    slug: "cleaner",
    name: "Cleaner",
    plural: "Cleaners",
    summary: "Regular or full-time cleaning by someone you can trust in your home.",
    intro:
      "Find a cleaner for regular or full-time housekeeping. Every cleaner has passed identity, guarantor, reference and address checks with a registered agency before they are proposed to you.",
    duties: [
      "Routine cleaning of rooms, kitchens and bathrooms",
      "Laundry, ironing and keeping linen fresh",
      "Deep cleans and help before and after events",
    ],
    image: "cleaner",
    faqs: [
      {
        question: "Can I hire a cleaner part-time?",
        answer: "Yes. Choose full-time or part-time when you post your request and describe the days you need help.",
      },
      ...sharedFaqs,
    ],
  },
};

export const servicesIntro = {
  eyebrow: "Services",
  title: "Nannies, drivers and cleaners, checked before they arrive.",
  body: "Choose the help you need. Every worker is recruited by a registered agency and has passed all four checks before they can be proposed to your family.",
} as const;
