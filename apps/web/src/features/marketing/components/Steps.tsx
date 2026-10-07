import { Stagger } from "@/components/animation/Stagger";
import type { Step } from "@/content/types";

export function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <Stagger as="ol" className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step.title} className="h-full rounded-lg border border-border bg-white p-6 shadow-sm">
          <span
            aria-hidden="true"
            className="inline-flex size-10 items-center justify-center rounded-full bg-blue-50 font-display font-bold text-blue-600"
          >
            {index + 1}
          </span>
          <h3 className="mt-4 text-xl">
            <span className="sr-only">Step {index + 1}: </span>
            {step.title}
          </h3>
          <p className="mt-2">{step.body}</p>
        </div>
      ))}
    </Stagger>
  );
}
