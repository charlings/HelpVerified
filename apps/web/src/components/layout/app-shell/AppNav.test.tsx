import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appNav } from "@/config/nav";
import { AppNavList } from "./AppNavList";
import { BottomTabs } from "./BottomTabs";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AppNavList", () => {
  beforeEach(() => {
    pathname = "/family/requests/new";
  });

  it("renders every item for the role", () => {
    render(<AppNavList items={appNav.family.items} variant="sidebar" />);
    for (const item of appNav.family.items) expect(screen.getByRole("link", { name: item.label })).toBeInTheDocument();
  });

  it("highlights the section of a nested page but not the exact-match home", () => {
    render(<AppNavList items={appNav.family.items} variant="sidebar" />);
    expect(screen.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});

describe("BottomTabs", () => {
  it("shows every family item as a tab with no More tab", () => {
    pathname = "/family";
    render(<BottomTabs nav={appNav.family} />);
    const nav = screen.getByRole("navigation", { name: "Family navigation" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).queryByRole("button", { name: "More" })).toBeNull();
  });

  it("puts agency overflow items in a More sheet", async () => {
    pathname = "/agency/billing";
    render(<BottomTabs nav={appNav.agency_admin} />);
    const nav = screen.getByRole("navigation", { name: "Agency navigation" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);

    await userEvent.click(within(nav).getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(within(sheet).getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });
});
