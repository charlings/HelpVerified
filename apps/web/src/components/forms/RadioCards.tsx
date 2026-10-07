import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Option = { value: string; label: string; description?: string };

type RadioCardsProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  name: string;
  legend: string;
  options: readonly Option[];
  error?: string;
  columns?: 1 | 2;
};

/**
 * Radio group rendered as selectable cards. Native radios inside a fieldset/legend, so arrow keys,
 * labels and screen readers work without extra code. Spread react-hook-form's register() into it.
 */
export const RadioCards = forwardRef<HTMLInputElement, RadioCardsProps>(function RadioCards(
  { name, legend, options, error, columns = 2, className, ...inputProps },
  ref,
) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset
      role="radiogroup"
      aria-invalid={error ? true : undefined}
      aria-describedby={errorId}
      className={cn("grid gap-3", className)}
    >
      <legend className="mb-1 text-sm font-semibold text-navy-900">{legend}</legend>
      <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border border-border-strong bg-white p-4 transition-colors duration-(--duration-fast)",
                "hover:border-blue-600 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:focus-visible]:shadow-(--focus-ring)",
                error && "border-danger-600",
              )}
            >
              <input
                ref={ref}
                id={id}
                type="radio"
                name={name}
                value={option.value}
                className="mt-1 size-4 shrink-0 accent-blue-600 focus-visible:shadow-none"
                // Each radio points at the group's error, so it's read out when focus lands on it.
                aria-describedby={errorId}
                {...inputProps}
              />
              <span>
                <span className="block font-semibold text-navy-900">{option.label}</span>
                {option.description ? <span className="mt-1 block text-sm">{option.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
});
