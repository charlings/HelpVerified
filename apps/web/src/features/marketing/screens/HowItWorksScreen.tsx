import { home } from "@/content/home";
import { agencyJourney, familyJourney } from "@/content/journey";
import { howItWorks } from "@/content/pages";
import { CtaBanner } from "../components/CtaBanner";
import { EditorialCards } from "../components/EditorialCards";
import { Hero } from "../components/Hero";
import { Section, SectionHeading } from "../components/Section";
import { Steps } from "../components/Steps";

export function HowItWorksScreen() {
  return (
    <>
      <Hero {...howItWorks.statement} />

      <Section tone="tint">
        {(id) => (
          <>
            <SectionHeading id={id} {...howItWorks.family} />
            <Steps steps={familyJourney} />
          </>
        )}
      </Section>

      <Section>
        {(id) => (
          <>
            <SectionHeading id={id} {...howItWorks.agency} />
            <Steps steps={agencyJourney} />
          </>
        )}
      </Section>

      <Section tone="tint">
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow={howItWorks.more.eyebrow} title={howItWorks.more.title} />
            <EditorialCards cards={howItWorks.more.cards} />
          </>
        )}
      </Section>

      <CtaBanner {...home.cta} />
    </>
  );
}
