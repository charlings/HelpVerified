import { cn } from "@/lib/cn";

type SoftShapeProps = {
  tone?: "blue" | "amber";
  children: React.ReactNode;
  className?: string;
};

/** A photo sitting on a soft, rotated shape. The shape is decorative. */
export function SoftShape({ tone = "blue", children, className }: SoftShapeProps) {
  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "absolute -inset-3 rotate-3 rounded-[2.5rem] sm:-inset-5",
          tone === "blue" ? "bg-blue-100" : "bg-amber-400/20",
        )}
      />
      <div className="relative overflow-hidden rounded-lg shadow-md">{children}</div>
    </div>
  );
}
