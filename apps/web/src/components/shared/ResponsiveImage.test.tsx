import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { images } from "@/assets/images";
import { ResponsiveImage } from "./ResponsiveImage";

vi.mock("@/assets/brand", () => ({
  brand: { logoMark: { src: { src: "/mark.png", width: 10, height: 10 }, alt: "HelpVerified" } },
}));

describe("ResponsiveImage", () => {
  it("renders the mapped alt text, focal point and responsive sources", () => {
    render(<ResponsiveImage image={images.nanny} sizes="100vw" />);
    const img = screen.getByRole("img", { name: images.nanny.alt });
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.getAttribute("srcset")).toContain("/images/nanny-1600.jpg 1600w");
    expect(img).toHaveStyle({ objectPosition: images.nanny.focal });
  });

  it("loads eagerly when marked priority", () => {
    render(<ResponsiveImage image={images.driver} sizes="100vw" priority />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
  });

  it("hides decorative images from assistive technology", () => {
    const { container } = render(<ResponsiveImage image={images.cleaner} sizes="100vw" decorative />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("falls back to the brand placeholder when no image is supplied", () => {
    const { container } = render(<ResponsiveImage image={undefined} sizes="100vw" />);
    expect(container.querySelector("[data-placeholder='true']")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
