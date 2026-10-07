import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyPaymentsScreen } from "@/features/billing/screens/FamilyPaymentsScreen";
import { PlacementDetailScreen } from "@/features/placements/screens/PlacementDetailScreen";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { FamilyDashboardScreen } from "./FamilyDashboardScreen";
import { FamilySettingsScreen } from "./FamilySettingsScreen";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/family",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  nav.push.mockReset();
  await signInAsDemo("family@demo.hv");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function asBola() {
  resetAuthState();
  await signInAsDemo("bola@demo.hv");
}

describe("Family placement detail", () => {
  it("offers confirm, replacement and end during the trial", async () => {
    renderInWorkspace(<PlacementDetailScreen placementId="p-blessing" viewer="family" />);
    expect(await screen.findByRole("button", { name: "Confirm placement" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request a replacement" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End placement" })).toBeInTheDocument();
    expect(screen.getByText("0 of 1 free")).toBeInTheDocument();
  });

  it("confirms the placement", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<PlacementDetailScreen placementId="p-blessing" viewer="family" />);
    await user.click(await screen.findByRole("button", { name: "Confirm placement" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm this placement?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm placement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Confirmed", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm placement" })).toBeNull();
  });

  it("requests a replacement with a reason and opens the new request", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<PlacementDetailScreen placementId="p-blessing" viewer="family" />);
    await user.click(await screen.findByRole("button", { name: "Request a replacement" }));
    const dialog = await screen.findByRole("dialog", { name: "Request a replacement?" });
    await user.click(within(dialog).getByRole("button", { name: "Request replacement" }));
    expect(await within(dialog).findByText(/Say what didn't work/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "Not comfortable with infants.");
    await user.click(within(dialog).getByRole("button", { name: "Request replacement" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/family\/requests\/r-/)));
  });

  it("an unpaid hold offers payment and cancellation", async () => {
    await asBola();
    const user = userEvent.setup();
    renderInWorkspace(<PlacementDetailScreen placementId="p-grace" viewer="family" />);
    expect(await screen.findByText("Payment needed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pay placement fee" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/demo\/checkout\?reference=/)));
  });

  it("cancels an unpaid hold", async () => {
    await asBola();
    const user = userEvent.setup();
    renderInWorkspace(<PlacementDetailScreen placementId="p-grace" viewer="family" />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this placement?" });
    await user.type(within(dialog).getByLabelText("Reason"), "We found help elsewhere.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel placement" }));
    expect(await screen.findByText("Cancelled", { selector: "span" })).toBeInTheDocument();
  });
});

describe("Family dashboard", () => {
  it("greets the family and shows the trial and requests to review", async () => {
    renderInWorkspace(<FamilyDashboardScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: /^Welcome, / })).toBeInTheDocument();
    const placements = await screen.findByRole("region", { name: "Your placements" });
    expect(within(placements).getByText("Trial ends in 2 days")).toBeInTheDocument();
    const requests = screen.getByRole("region", { name: "Open requests" });
    expect(within(requests).getByText("1 proposal to review")).toBeInTheDocument();
  });

  it("flags a hold that needs payment", async () => {
    await asBola();
    renderInWorkspace(<FamilyDashboardScreen />);
    expect(await screen.findByText("Payment needed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the placement" })).toHaveAttribute(
      "href",
      "/family/placements/p-grace",
    );
  });

  it("invites a new family to post a request", async () => {
    resetAuthState();
    await signInAsDemo("newfamily@demo.hv");
    renderInWorkspace(<FamilyDashboardScreen />);
    expect(await screen.findByRole("heading", { name: "Find help you can trust" })).toBeInTheDocument();
  });
});

describe("Family payments and settings", () => {
  it("lists the family's own placement fees", async () => {
    renderInWorkspace(<FamilyPaymentsScreen />);
    const table = await screen.findByRole("table", { name: "Payment history" });
    expect(within(table).getAllByText(/^HV-/).length).toBeGreaterThan(0);
  });

  it("shows an empty history to a new family", async () => {
    resetAuthState();
    await signInAsDemo("newfamily@demo.hv");
    renderInWorkspace(<FamilyPaymentsScreen />);
    expect(await screen.findByRole("heading", { name: "No payments yet" })).toBeInTheDocument();
  });

  it("shows the account and family details", async () => {
    renderInWorkspace(<FamilySettingsScreen />);
    expect(await screen.findByText("family@demo.hv")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Family" })).toHaveTextContent("Lagos");
  });
});
