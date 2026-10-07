import type { Testimonial } from "@/content/types";
import { Section, SectionHeading } from "./Section";

/** Renders nothing until real testimonials exist in content/testimonials.ts. */
export function Testimonials({ items }: { items: readonly Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <Section>
      {(id) => (
        <>
          <SectionHeading id={id} eyebrow="Families and agencies" title="In their words" />
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {items.map((t) => (
              <li key={t.name}>
                <figure className="h-full rounded-lg border border-border bg-white p-6 shadow-sm">
                  <blockquote className="text-lg text-navy-900">“{t.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold text-navy-900">{t.name}</span>, {t.context}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
