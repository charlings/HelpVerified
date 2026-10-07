import { Stagger } from "@/components/animation/Stagger";
import { Section, SectionHeading } from "./Section";

type TrialPromiseProps = {
  eyebrow: string;
  title: string;
  points: readonly { title: string; body: string }[];
};

export function TrialPromise({ eyebrow, title, points }: TrialPromiseProps) {
  return (
    <Section tone="tint">
      {(id) => (
        <>
          <SectionHeading id={id} eyebrow={eyebrow} title={title} />
          <Stagger className="mt-10 grid gap-6 md:grid-cols-3">
            {points.map((point) => (
              <div key={point.title} className="h-full border-l-4 border-blue-600 pl-5">
                <h3 className="text-xl">{point.title}</h3>
                <p className="mt-2">{point.body}</p>
              </div>
            ))}
          </Stagger>
        </>
      )}
    </Section>
  );
}
