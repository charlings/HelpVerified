import { routes } from "@/config/routes";
import type { EditorialCard, Faq } from "./types";

export const howItWorks = {
  statement: {
    eyebrow: "How it works",
    title: "A clear process for families and agencies.",
    body: "Families post what they need. Agencies propose workers who have passed every check. Placements start with a trial, and replacements are part of the deal.",
  },
  family: { eyebrow: "For families", title: "Hiring through HelpVerified" },
  agency: { eyebrow: "For agencies", title: "Placing workers through HelpVerified" },
  more: {
    eyebrow: "Keep reading",
    title: "Find what you need next.",
    cards: [
      {
        eyebrow: "Services",
        title: "Nannies, drivers and cleaners",
        summary: "What each role covers and how checks work for them.",
        href: routes.services,
        linkLabel: "Explore services",
        image: "nanny",
      },
      {
        eyebrow: "Agencies",
        title: "Join as a registered agency",
        summary: "What you need to list workers and receive requests.",
        href: routes.forAgencies,
        linkLabel: "For agencies",
        image: "driver",
      },
      {
        eyebrow: "Pricing",
        title: "What it costs",
        summary: "One placement fee for families. One monthly subscription for agencies.",
        href: routes.pricing,
        linkLabel: "See pricing",
        image: "cleaner",
      },
    ] satisfies EditorialCard[],
  },
} as const;

// TODO(content): agency value proposition and requirements are drafts.
export const forAgencies = {
  statement: {
    eyebrow: "For agencies",
    title: "Your vetting, made visible to families.",
    body: "You already check the people you place. HelpVerified records those checks, shows families when each was done, and sends you requests from households looking for verified staff.",
    image: "driver",
  },
  benefits: {
    eyebrow: "Why list with us",
    title: "Built around the way agencies work.",
    items: [
      { title: "Requests that match", body: "See open requests for the roles you place, in the areas you cover." },
      {
        title: "Checks in one place",
        body: "Record evidence for each check once. We tell you when a check needs renewing.",
      },
      { title: "Placements you can track", body: "Follow each placement through payment, trial and confirmation." },
    ],
  },
  requirements: {
    eyebrow: "What you need",
    title: "Before you can propose workers",
    items: [
      "A registered business with a CAC number",
      "Approval from the HelpVerified team",
      "An active monthly subscription",
      "All four checks completed for each worker you list",
    ],
  },
  journey: { eyebrow: "Getting started", title: "From sign-up to first placement" },
  cta: {
    title: "Ready to list your agency?",
    body: "Applications are reviewed by our team. We'll be in touch once yours is approved.",
    primary: { label: "Register your agency", href: routes.auth.agencySignup },
    secondary: { label: "Ask a question", href: routes.contact },
  },
} as const;

// TODO(content): amounts are null until the owner confirms prices. Inclusions are drafts.
export const pricing = {
  intro: {
    eyebrow: "Pricing",
    title: "Simple pricing for families and agencies.",
    body: "Families pay a one-off placement fee when they accept a worker. Agencies pay a monthly subscription to list workers and receive requests.",
  },
  plans: [
    {
      id: "family",
      audience: "For families",
      name: "Placement fee",
      amountKobo: null as number | null,
      period: "per placement",
      description: "Paid once, when you accept a worker.",
      includes: [
        "Post requests for free",
        "Proposals from registered agencies",
        "A trial period before you confirm",
        "A free replacement if it doesn't work out",
      ],
      cta: { label: "Find a worker", href: routes.auth.signup },
    },
    {
      id: "agency",
      audience: "For agencies",
      name: "Agency subscription",
      amountKobo: null as number | null,
      period: "per month",
      description: "Billed monthly.",
      includes: [
        "List workers who have passed all four checks",
        "Receive matching family requests",
        "Track placements from trial to confirmation",
        "Alerts when a check needs renewing",
      ],
      cta: { label: "Register your agency", href: routes.auth.agencySignup },
    },
  ],
  priceToBeConfirmed: "Price to be confirmed",
  faqs: [
    {
      question: "When do families pay?",
      answer: "When you accept a worker's proposal. Posting a request and reviewing proposals is free.",
    },
    {
      question: "Is a replacement charged again?",
      answer: "No. Your placement fee covers a replacement if the first placement doesn't work out.",
    },
    {
      question: "How are payments made?",
      answer: "Payments are processed securely by Paystack in naira. We never see or store your card details.",
    },
  ] satisfies Faq[],
} as const;

// TODO(content): company story is a draft.
export const about = {
  statement: {
    eyebrow: "About",
    title: "We exist so families can see who they're letting in.",
    body: "Hiring help at home has run on word of mouth for too long. HelpVerified works with registered agencies to make background checks visible, consistent and current.",
    image: "cleaner",
  },
  why: {
    eyebrow: "Why HelpVerified",
    title: "Trust shouldn't depend on who you know.",
    body: [
      "Many families find domestic staff through friends, neighbours or informal agents. When it works, it works. When it doesn't, there's often no record of who the person is or who vouched for them.",
      "We set one standard for every agency on the platform: four checks, recorded with evidence, renewed on schedule, and shown to families before they decide.",
    ],
  },
  rules: {
    eyebrow: "Our two rules",
    title: "Built into the platform, not just our policy.",
    items: [
      {
        title: "No worker is shown until all four checks are done",
        body: "If any check is missing, expired or rejected, the worker can't be proposed to a family.",
      },
      {
        title: "No worker is placed with two families at once",
        body: "Once a worker is placed, they can't be offered to anyone else until that placement ends.",
      },
    ],
  },
  data: {
    eyebrow: "Your data",
    title: "Identity documents stay private.",
    items: [
      "We never store a worker's full National Identification Number.",
      "Identity documents are seen only by the worker's agency and our verification team, and every view is logged.",
      "Families see which checks were completed and when, never the documents themselves.",
    ],
    link: { label: "Read our privacy policy", href: routes.privacy },
  },
} as const;
