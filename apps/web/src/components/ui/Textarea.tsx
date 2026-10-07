import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 5, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "w-full rounded-lg border border-border-strong bg-white px-4 py-3 text-base text-navy-900 placeholder:text-slate-500",
          "disabled:cursor-not-allowed disabled:bg-slate-100 aria-invalid:border-danger-600",
          className,
        )}
        {...props}
      />
    );
  },
);
