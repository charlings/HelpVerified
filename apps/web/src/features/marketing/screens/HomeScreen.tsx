import Link from "next/link";
import { images } from "@/assets/images";
import { Reveal } from "@/components/animation/Reveal";
import { ResponsiveImage } from "@/components/shared/ResponsiveImage";
import { buttonVariants } from "@/components/ui/Button";
import { checks, checksIntro } from "@/content/checks";
import { home } from "@/content/home";
import { familyJourney } from "@/content/journey";
import { services } from "@/content/services";
import { testimonials } from "@/content/testimonials";
import { trialPromise } from "@/content/trial";
import { ChecksBand } from "../components/ChecksBand";
import { CtaBanner } from "../components/CtaBanner";
import { Hero } from "../components/Hero";
import { RoleCards } from "../components/RoleCards";
import { Section, SectionHeading } from "../components/Section";
import { SoftShape } from "../components/SoftShape";
import { Steps } from "../components/Steps";
import { Testimonials } from "../components/Testimonials";
import { TrialPromise } from "../components/TrialPromise";

export function HomeScreen() {
  return (
    <>
      <Hero {...home.hero} />

      <Section tone="tint">
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow={home.roles.eyebrow} title={home.roles.title} />
            <RoleCards services={Object.values(services)} />
          </>
        )}
      </Section>

      <ChecksBand {...checksIntro} checks={checks} />

      <Section>
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow={home.journey.eyebrow} title={home.journey.title} />
            <Steps steps={familyJourney} />
            <Link href={home.journey.cta.href} className={buttonVariants({ variant: "secondary", className: "mt-10" })}>
              {home.journey.cta.label}
            </Link>
          </>
        )}
      </Section>

      <Section tone="tint">
        {(id) => (
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal variant="scale" className="order-last lg:order-first">
              <SoftShape tone="amber" className="mx-3 sm:mx-5">
                <ResponsiveImage image={images[home.agencies.image]} sizes="(min-width: 1024px) 560px, 100vw" />
              </SoftShape>
            </Reveal>
            <Reveal>
              <SectionHeading
                id={id}
                eyebrow={home.agencies.eyebrow}
                title={home.agencies.title}
                body={home.agencies.body}
              />
              <Link href={home.agencies.cta.href} className={buttonVariants({ className: "mt-8" })}>
                {home.agencies.cta.label}
              </Link>
            </Reveal>
          </div>
        )}
      </Section>

      <TrialPromise {...trialPromise} />
      <Testimonials items={testimonials} />
      <CtaBanner {...home.cta} />
    </>
  );
}
