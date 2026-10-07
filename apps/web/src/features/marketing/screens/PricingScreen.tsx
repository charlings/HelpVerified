import { Check } from "lucide-react";
import Link from "next/link";
import { Stagger } from "@/components/animation/Stagger";
import { buttonVariants } from "@/components/ui/Button";
import { pricing } from "@/content/pages";
import { formatNaira } from "@/lib/format";
import { FaqList } from "../components/FaqList";
import { Hero } from "../components/Hero";
import { Section, SectionHeading } from "../components/Section";

export function PricingScreen() {
  return (
    <>
      <Hero {...pricing.intro} />

      <Section tone="tint" className="pt-0 md:pt-0">
        {(id) => (
          <>
            <h2 id={id} className="sr-only">
              Plans
            </h2>
            <Stagger className="grid gap-6 pt-(--section-y-mobile) md:grid-cols-2 md:pt-(--section-y)">
              {pricing.plans.map((plan) => (
                <article
                  key={plan.id}
                  aria-labelledby={`plan-${plan.id}`}
                  className="flex h-full flex-col rounded-lg border border-border bg-white p-8 shadow-sm"
                >
                  <p className="text-sm font-semibold tracking-(--tracking-eyebrow) text-blue-600 uppercase">
                    {plan.audience}
                  </p>
                  <h3 id={`plan-${plan.id}`} className="mt-2 text-2xl">
                    {plan.name}
                  </h3>
                  <p className="mt-6" data-testid={`price-${plan.id}`}>
                    {plan.amountKobo === null ? (
                      <span className="font-display text-2xl font-bold text-navy-900">
                        {pricing.priceToBeConfirmed}
                      </span>
                    ) : (
                      <>
                        <span className="font-display text-4xl font-bold text-navy-900">
                          {formatNaira(plan.amountKobo)}
                        </span>{" "}
                        <span>{plan.period}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-2">{plan.description}</p>
                  <ul className="mt-6 grid flex-1 gap-3">
                    {plan.includes.map((item) => (
                      <li key={item} className="flex gap-3 text-navy-900">
                        <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-blue-600" strokeWidth={3} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.cta.href} className={buttonVariants({ className: "mt-8 w-full" })}>
                    {plan.cta.label}
                  </Link>
                </article>
              ))}
            </Stagger>
          </>
        )}
      </Section>

      <Section>
        {(id) => (
          <div className="max-w-3xl">
            <SectionHeading id={id} eyebrow="Questions" title="Pricing questions" />
            <FaqList faqs={pricing.faqs} />
          </div>
        )}
      </Section>
    </>
  );
}
