import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/cn";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

type FormFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optionalLabel?: boolean;
  className?: string;
  /** Receives the props that wire the control to its label, hint and error. */
  children: (control: FieldControlProps) => React.ReactNode;
};

export function FormField({ id, label, hint, error, required, optionalLabel, className, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {optionalLabel ? <span className="ml-1 font-normal text-slate-600">(optional)</span> : null}
      </Label>
      {hint ? (
        <p id={hintId} className="-mt-1 text-sm text-slate-600">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
