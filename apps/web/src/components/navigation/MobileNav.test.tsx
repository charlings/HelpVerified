import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { headerActions, isNavGroup, marketingNav } from "@/config/nav";
import { MobileNav } from "./MobileNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/pricing" }));

describe("MobileNav", () => {
  it("opens a dialog listing every marketing link and both actions", async () => {
    render(<MobileNav entries={marketingNav} actions={headerActions} />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toBeVisible();
    const labels = marketingNav.flatMap((e) => (isNavGroup(e) ? e.items.map((i) => i.label) : [e.label]));
    for (const label of labels) expect(screen.getByRole("link", { name: label, hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get started" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("marks the current page", async () => {
    render(<MobileNav entries={marketingNav} actions={headerActions} />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("aria-current", "page");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<MobileNav entries={marketingNav} actions={headerActions} />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
