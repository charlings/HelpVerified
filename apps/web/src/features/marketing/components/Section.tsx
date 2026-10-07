import { useId } from "react";
import { cn } from "@/lib/cn";

type Tone = "white" | "tint" | "navy";

const toneClasses: Record<Tone, string> = {
  white: "bg-white",
  tint: "bg-blue-50",
  navy: "bg-navy-900 text-white/80",
};

type SectionProps = {
  tone?: Tone;
  className?: string;
  id?: string;
  children: (headingId: string) => React.ReactNode;
};

/** Page section with the standard vertical rhythm. Children receive the id to use on the section's h2. */
export function Section({ tone = "white", className, id, children }: SectionProps) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("py-(--section-y-mobile) md:py-(--section-y)", toneClasses[tone], className)}
    >
      <div className="mx-auto w-full max-w-(--container-marketing) px-4 sm:px-6">{children(headingId)}</div>
    </section>
  );
}

type SectionHeadingProps = {
  id: string;
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
  onDark?: boolean;
  level?: 1 | 2;
  className?: string;
};

export function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  align = "left",
  onDark = false,
  level = 2,
  className,
}: SectionHeadingProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p
          className={cn(
            "text-sm font-semibold tracking-(--tracking-eyebrow) uppercase",
            onDark ? "text-white/80" : "text-blue-600",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <Heading
        id={id}
        tabIndex={-1}
        className={cn(
          "mt-3 outline-none",
          level === 1 ? "text-5xl lg:text-6xl" : "text-3xl md:text-4xl",
          onDark && "text-white",
        )}
      >
        {title}
      </Heading>
      {body ? (
        <p className={cn("mt-4 text-lg", align === "center" && "mx-auto", "max-w-(--container-prose)")}>{body}</p>
      ) : null}
    </div>
  );
}
