import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("always carries a text label so colour is never the only signal", () => {
    render(<Badge tone="danger">Suspended</Badge>);
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("adds a decorative check icon only to the verified tone", () => {
    const { container, rerender } = render(<Badge tone="verified">Verified</Badge>);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<Badge tone="info">Trial</Badge>);
    expect(container.querySelector("svg")).toBeNull();
  });
});
