import { routes, type ServiceSlug } from "@/config/routes";

export type PageKey =
  | "home"
  | "services"
  | ServiceSlug
  | "howItWorks"
  | "forAgencies"
  | "pricing"
  | "about"
  | "contact"
  | "privacy"
  | "terms";

type PageMeta = { title: string; description: string; path: string; absoluteTitle?: boolean };

// TODO(content): review titles and descriptions for search.
export const pageMeta: Record<PageKey, PageMeta> = {
  home: {
    title: "HelpVerified · Verified nannies, drivers and cleaners",
    absoluteTitle: true,
    description:
      "Hire nannies, drivers and cleaners from registered agencies in Nigeria. Every worker's ID, guarantor, references and address are checked first.",
    path: routes.home,
  },
  services: {
    title: "Services",
    description:
      "Nannies, drivers and cleaners from registered agencies, each checked for identity, guarantor, references and address before you meet them.",
    path: routes.services,
  },
  nanny: {
    title: "Verified nannies",
    description:
      "Hire a nanny whose identity, guarantor, references and address have been checked by a registered agency. Start with a trial.",
    path: routes.service("nanny"),
  },
  driver: {
    title: "Verified drivers",
    description:
      "Hire a family driver whose identity, guarantor, references and address have been checked by a registered agency. Start with a trial.",
    path: routes.service("driver"),
  },
  cleaner: {
    title: "Verified cleaners",
    description:
      "Hire a cleaner whose identity, guarantor, references and address have been checked by a registered agency. Start with a trial.",
    path: routes.service("cleaner"),
  },
  howItWorks: {
    title: "How it works",
    description:
      "Post a request, receive proposals of fully checked workers from registered agencies, and start with a trial. See how it works for families and agencies.",
    path: routes.howItWorks,
  },
  forAgencies: {
    title: "For agencies",
    description:
      "List the domestic staff you vet, show families when each check was done, and receive matching requests. Join HelpVerified as a registered agency.",
    path: routes.forAgencies,
  },
  pricing: {
    title: "Pricing",
    description:
      "One placement fee for families, paid when you accept a worker. One monthly subscription for agencies. See what each includes.",
    path: routes.pricing,
  },
  about: {
    title: "About",
    description:
      "Why HelpVerified exists, the two rules built into the platform, and how we keep identity documents private.",
    path: routes.about,
  },
  contact: {
    title: "Contact",
    description: "Questions about hiring, joining as an agency or anything else? Send the HelpVerified team a message.",
    path: routes.contact,
  },
  privacy: {
    title: "Privacy policy",
    description: "How HelpVerified collects, uses and protects personal data. Draft under legal review.",
    path: routes.privacy,
  },
  terms: {
    title: "Terms of use",
    description: "The terms for using HelpVerified as a family or an agency. Draft under legal review.",
    path: routes.terms,
  },
};
