import type { ImageKey } from "@/assets/images";
import type { ServiceSlug } from "@/config/routes";

export type Cta = { label: string; href: string };

export type Faq = { question: string; answer: string };

export type Step = { title: string; body: string };

export type Check = {
  kind: "id" | "guarantor" | "references" | "address";
  title: string;
  body: string;
};

export type Service = {
  slug: ServiceSlug;
  name: string;
  plural: string;
  summary: string;
  intro: string;
  duties: readonly string[];
  image: ImageKey;
  faqs: readonly Faq[];
};

export type EditorialCard = {
  eyebrow: string;
  title: string;
  summary: string;
  href: string;
  linkLabel: string;
  image?: ImageKey;
};

export type Testimonial = { quote: string; name: string; context: string };

export type LegalSection = { heading: string; body: readonly string[] };

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  draftNotice: string;
  sections: readonly LegalSection[];
};
