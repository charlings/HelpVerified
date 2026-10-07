"use client";

import { Children } from "react";
import { useInView } from "./useInView";

const MAX_INDEX = 6;

type StaggerProps = {
  children: React.ReactNode;
  /** Container element; items are wrapped in `itemAs` so list semantics stay valid (ul > li). */
  as?: "ul" | "ol" | "div";
  itemAs?: "li" | "div";
  className?: string;
  itemClassName?: string;
};

/** Reveals children one after another (80 ms apart, capped at 6 steps) once the group scrolls into view. */
export function Stagger({ children, as: Tag = "ul", itemAs, className, itemClassName }: StaggerProps) {
  const { ref, inView } = useInView<HTMLElement>();
  const Item = itemAs ?? (Tag === "div" ? "div" : "li");

  return (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {Children.toArray(children).map((child, index) => (
        <Item
          key={index}
          data-reveal="rise"
          data-visible={inView ? "true" : "false"}
          className={itemClassName}
          style={{ "--stagger-index": Math.min(index, MAX_INDEX) } as React.CSSProperties}
        >
          {child}
        </Item>
      ))}
    </Tag>
  );
}
