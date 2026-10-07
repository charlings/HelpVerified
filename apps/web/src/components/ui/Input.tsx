import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  shape?: "pill" | "app";
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, shape = "pill", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-(--control-h-md) w-full border border-border-strong bg-white px-4 text-base text-navy-900 placeholder:text-slate-500",
        "disabled:cursor-not-allowed disabled:bg-slate-100 aria-invalid:border-danger-600",
        shape === "pill" ? "rounded-full" : "rounded-md",
        className,
      )}
      {...props}
    />
  );
});
