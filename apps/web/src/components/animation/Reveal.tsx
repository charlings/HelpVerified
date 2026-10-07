"use client";

import { useInView } from "./useInView";

type RevealProps = {
  children: React.ReactNode;
  variant?: "rise" | "scale";
  /** Extra delay in ms, e.g. 100 for an image that follows its text. */
  delay?: number;
  className?: string;
};

/** Fades content in when it scrolls into view. Final state is shown immediately with reduced motion (base.css). */
export function Reveal({ children, variant = "rise", delay = 0, className }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-reveal={variant}
      data-visible={inView ? "true" : "false"}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
