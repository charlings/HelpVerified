import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  info: "border-blue-100 bg-blue-50 text-blue-700",
  success: "border-success-600/20 bg-success-50 text-success-600",
  warning: "border-warning-700/20 bg-warning-50 text-warning-700",
  danger: "border-danger-600/20 bg-danger-50 text-danger-700",
};

type AlertProps = React.HTMLAttributes<HTMLDivElement> & { tone?: Tone; title?: string };

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = "info", title, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={tone === "danger" ? "alert" : "status"}
      tabIndex={-1}
      className={cn("rounded-md border p-4 text-sm", toneClasses[tone], className)}
      {...props}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
});
