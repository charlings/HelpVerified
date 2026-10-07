import { checks } from "@/content/checks";
import { familyJourney } from "@/content/journey";
import { services } from "@/content/services";
import { trialPromise } from "@/content/trial";
import { routes, type ServiceSlug } from "@/config/routes";
import { ChecksBand } from "../components/ChecksBand";
import { CtaBanner } from "../components/CtaBanner";
import { FaqList } from "../components/FaqList";
import { Hero } from "../components/Hero";
import { Section, SectionHeading } from "../components/Section";
import { Steps } from "../components/Steps";
import { TrialPromise } from "../components/TrialPromise";
import { Stagger } from "@/components/animation/Stagger";

export function ServiceDetailScreen({ slug }: { slug: ServiceSlug }) {
  const service = services[slug];
  const role = service.name.toLowerCase();

  return (
    <>
      <Hero
        eyebrow={`Verified ${service.plural.toLowerCase()}`}
        title={`Hire a ${role} you can trust.`}
        body={service.intro}
        primary={{ label: `Request a ${role}`, href: routes.auth.signupFor(slug) }}
        secondary={{ label: "All services", href: routes.services }}
        image={service.image}
      />

      <Section tone="tint">
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow="The role" title={`What a ${role} can help with`} />
            <Stagger className="mt-10 grid gap-6 md:grid-cols-3">
              {service.duties.map((duty) => (
                <p key={duty} className="h-full rounded-lg border border-border bg-white p-6 text-navy-900 shadow-sm">
                  {duty}
                </p>
              ))}
            </Stagger>
          </>
        )}
      </Section>

      <ChecksBand
        eyebrow="Before you meet them"
        title={`Every ${role} has passed four checks.`}
        body="You'll see each completed check and the date it was done on the worker's profile. Families never see the documents themselves."
        checks={checks}
      />

      <Section>
        {(id) => (
          <>
            <SectionHeading
              id={id}
              eyebrow="How hiring works"
              title={`From request to your first day with a ${role}`}
            />
            <Steps steps={familyJourney} />
          </>
        )}
      </Section>

      <TrialPromise {...trialPromise} />

      <Section>
        {(id) => (
          <div className="max-w-3xl">
            <SectionHeading id={id} eyebrow="Questions" title="Frequently asked questions" />
            <FaqList faqs={service.faqs} />
          </div>
        )}
      </Section>

      <CtaBanner
        title={`Ready to find a ${role}?`}
        body="Post a request for free. Agencies near you will propose workers who have passed every check."
        primary={{ label: `Request a ${role}`, href: routes.auth.signupFor(slug) }}
        secondary={{ label: "Talk to us", href: routes.contact }}
      />
    </>
  );
}
