import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/animation/Reveal";
import { Stagger } from "@/components/animation/Stagger";
import { home } from "@/content/home";
import { about } from "@/content/pages";
import { CtaBanner } from "../components/CtaBanner";
import { Hero } from "../components/Hero";
import { Section, SectionHeading } from "../components/Section";

export function AboutScreen() {
  const { statement, why, rules, data } = about;
  return (
    <>
      <Hero {...statement} />

      <Section tone="tint">
        {(id) => (
          <Reveal className="max-w-3xl">
            <SectionHeading id={id} eyebrow={why.eyebrow} title={why.title} />
            {why.body.map((paragraph) => (
              <p key={paragraph} className="mt-4 max-w-(--container-prose) text-lg">
                {paragraph}
              </p>
            ))}
          </Reveal>
        )}
      </Section>

      <Section tone="navy">
        {(id) => (
          <>
            <SectionHeading id={id} eyebrow={rules.eyebrow} title={rules.title} onDark />
            <Stagger className="mt-10 grid gap-6 md:grid-cols-2">
              {rules.items.map((rule) => (
                <div key={rule.title} className="h-full rounded-lg bg-white/5 p-6 ring-1 ring-white/10">
                  <h3 className="text-xl text-white">{rule.title}</h3>
                  <p className="mt-2 text-white/80">{rule.body}</p>
                </div>
              ))}
            </Stagger>
          </>
        )}
      </Section>

      <Section>
        {(id) => (
          <div className="grid gap-10 lg:grid-cols-2">
            <SectionHeading id={id} eyebrow={data.eyebrow} title={data.title} />
            <div>
              <Stagger className="grid gap-4">
                {data.items.map((item) => (
                  <p key={item} className="flex gap-3 text-lg text-navy-900">
                    <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-blue-600" />
                    {item}
                  </p>
                ))}
              </Stagger>
              <Link
                href={data.link.href}
                className="mt-6 inline-flex min-h-11 items-center font-semibold text-blue-600 hover:underline"
              >
                {data.link.label}
              </Link>
            </div>
          </div>
        )}
      </Section>

      <CtaBanner {...home.cta} />
    </>
  );
}
