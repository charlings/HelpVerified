import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";
import { Stagger } from "./Stagger";

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let callbacks: ObserverCallback[] = [];

beforeEach(() => {
  callbacks = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: ObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Reveal", () => {
  it("starts hidden and becomes visible when it intersects", () => {
    render(<Reveal>Hello</Reveal>);
    const el = screen.getByText("Hello");
    expect(el).toHaveAttribute("data-visible", "false");
    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])));
    expect(el).toHaveAttribute("data-visible", "true");
  });

  it("shows content immediately where IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText("Hello")).toHaveAttribute("data-visible", "true");
  });
});

describe("Stagger", () => {
  it("wraps children in list items and caps the stagger index at 6", () => {
    render(
      <Stagger>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i}>Item {i}</span>
        ))}
      </Stagger>,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(9);
    expect(items[2]).toHaveStyle({ "--stagger-index": "2" });
    expect(items[8]).toHaveStyle({ "--stagger-index": "6" });
  });
});
