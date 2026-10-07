import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type CheckboxFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  label: React.ReactNode;
  error?: string;
};

/** Native checkbox with its label beside it and an error below, wired with aria-describedby. */
export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { id, label, error, className, ...props },
  ref,
) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("grid gap-2", className)}>
      {/* The whole row is the label, so the touch target is at least 44 px tall, not just the box. */}
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm text-navy-900">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="size-5 shrink-0 cursor-pointer self-start accent-blue-600"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
