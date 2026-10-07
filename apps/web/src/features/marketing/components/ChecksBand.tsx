import { Stagger } from "@/components/animation/Stagger";
import type { Check } from "@/content/types";
import { Section, SectionHeading } from "./Section";
import { VerifiedMark } from "@/components/brand/VerifiedMark";

type ChecksBandProps = {
  eyebrow: string;
  title: string;
  body: string;
  checks: readonly Check[];
};

export function ChecksBand({ eyebrow, title, body, checks }: ChecksBandProps) {
  return (
    <Section tone="navy">
      {(id) => (
        <>
          <SectionHeading id={id} eyebrow={eyebrow} title={title} body={body} onDark />
          <Stagger as="ol" className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {checks.map((check, i) => (
              <div key={check.kind} className="h-full rounded-lg bg-white/5 p-6 ring-1 ring-white/10">
                <VerifiedMark />
                <h3 className="mt-4 text-xl text-white">
                  <span className="sr-only">Check {i + 1}: </span>
                  {check.title}
                </h3>
                <p className="mt-2 text-sm text-white/80">{check.body}</p>
              </div>
            ))}
          </Stagger>
        </>
      )}
    </Section>
  );
}
