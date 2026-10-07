import { cn } from "@/lib/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & { context?: "app" | "marketing" };

export function Card({ context = "app", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "border border-border bg-surface p-6 shadow-sm",
        context === "app" ? "rounded-md" : "rounded-lg",
        className,
      )}
      {...props}
    />
  );
}
