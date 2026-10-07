import { routes } from "@/config/routes";

// TODO(content): headline and supporting copy are drafts.
export const home = {
  hero: {
    eyebrow: "Verified domestic staff",
    title: "Help you can trust, checked before they reach your door.",
    body: "Hire nannies, drivers and cleaners from registered agencies. Every worker's identity, guarantor, references and address are checked before they can be proposed to your family.",
    primary: { label: "Find a worker", href: routes.auth.signup },
    secondary: { label: "How it works", href: routes.howItWorks },
    image: "nanny",
  },
  roles: {
    eyebrow: "Who you can hire",
    title: "Three roles. One standard of checks.",
  },
  journey: {
    eyebrow: "How it works",
    title: "From request to trial in four steps.",
    cta: { label: "See the full process", href: routes.howItWorks },
  },
  agencies: {
    eyebrow: "For agencies",
    title: "Show families the work you already do.",
    body: "Registered agencies list workers who have passed all four checks and receive requests from families looking for exactly that.",
    cta: { label: "List your agency", href: routes.forAgencies },
    image: "driver",
  },
  cta: {
    title: "Ready to find help you can trust?",
    body: "Post a request for free. You only pay when you accept a worker.",
    primary: { label: "Find a worker", href: routes.auth.signup },
    secondary: { label: "Talk to us", href: routes.contact },
  },
} as const;
