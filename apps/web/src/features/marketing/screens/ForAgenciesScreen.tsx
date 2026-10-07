import { Check } from "lucide-react";
import { Stagger } from "@/components/animation/Stagger";
import { agencyJourney } from "@/content/journey";
import { forAgencies } from "@/content/pages";
import { CtaBanner } from "../components/CtaBanner";
import { Hero } from "../components/Hero";
import { Section, SectionHeading } from "../components/Section";
import { Steps } from "../components/Steps";

export function ForAgenciesScreen() {
  const { statement, benefits, requirements, journey, cta } = forAgencies;
  return (
    <>
      <Hero
        eyebrow={statement.eyebrow}
        title={statement.title}
        body={statement.body}
        primary={cta.primary}
        secondary={cta.secondary}
        image={statement.image}
        shapeTone="amber"
      />

      <Section tone="tint">
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow={benefits.eyebrow} title={benefits.title} />
            <Stagger className="mt-10 grid gap-6 md:grid-cols-3">
              {benefits.items.map((item) => (
                <div key={item.title} className="h-full rounded-lg border border-border bg-white p-6 shadow-sm">
                  <h3 className="text-xl">{item.title}</h3>
                  <p className="mt-2">{item.body}</p>
                </div>
              ))}
            </Stagger>
          </>
        )}
      </Section>

      <Section>
        {(id) => (
          <div className="grid gap-10 lg:grid-cols-2">
            <SectionHeading id={id} eyebrow={requirements.eyebrow} title={requirements.title} />
            <Stagger className="grid gap-4">
              {requirements.items.map((item) => (
                <p key={item} className="flex gap-3 text-lg text-navy-900">
                  <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-blue-600" strokeWidth={3} />
                  {item}
                </p>
              ))}
            </Stagger>
          </div>
        )}
      </Section>

      <Section tone="tint">
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow={journey.eyebrow} title={journey.title} />
            <Steps steps={agencyJourney} />
          </>
        )}
      </Section>

      <CtaBanner {...cta} />
    </>
  );
}
