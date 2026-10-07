import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

type StepperProps = {
  steps: readonly string[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
};

/** Progress indicator for multi-step forms. The form itself owns step state and validation. */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex items-center gap-2">
        {steps.map((label, index) => {
          const state = index < current ? "done" : index === current ? "current" : "upcoming";
          return (
            <li
              key={label}
              className="flex flex-1 items-center gap-2"
              aria-current={state === "current" ? "step" : undefined}
            >
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  state === "done" && "bg-blue-600 text-white",
                  state === "current" && "border-2 border-blue-600 bg-white text-blue-600",
                  state === "upcoming" && "border border-border-strong bg-white text-slate-600",
                )}
              >
                {state === "done" ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  state === "current" ? "font-semibold text-navy-900" : "text-slate-600",
                )}
              >
                {label}
                <span className="sr-only">
                  {state === "done" ? " (completed)" : state === "upcoming" ? " (not started)" : ""}
                </span>
              </span>
              {index < steps.length - 1 ? <span aria-hidden="true" className="h-px flex-1 bg-border-strong" /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm sm:hidden">
        Step {current + 1} of {steps.length}: <span className="font-semibold text-navy-900">{steps[current]}</span>
      </p>
    </nav>
  );
}
