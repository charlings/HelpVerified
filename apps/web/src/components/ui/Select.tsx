import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { shape?: "pill" | "app" };

/** Native select for full keyboard and screen-reader support, styled to match Input. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, shape = "pill", children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-(--control-h-md) w-full appearance-none border border-border-strong bg-white pr-10 pl-4 text-base text-navy-900",
          "disabled:cursor-not-allowed disabled:bg-slate-100 aria-invalid:border-danger-600",
          shape === "pill" ? "rounded-full" : "rounded-md",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-slate-600"
      />
    </div>
  );
});
