import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { AgencySettingsScreen } from "@/features/agencies/screens/AgencySettingsScreen";
import { AgencyBillingScreen } from "@/features/billing/screens/AgencyBillingScreen";
import { PlacementDetailScreen } from "@/features/placements/screens/PlacementDetailScreen";
import { PlacementsListScreen } from "@/features/placements/screens/PlacementsListScreen";
import { errorResponse } from "@/mocks/errors";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { AgencyRequestDetailScreen } from "./AgencyRequestDetailScreen";
import { AgencyRequestsScreen } from "./AgencyRequestsScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/agency",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  await signInAsDemo("agency@demo.hv");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function openProposeDialog(requestId: string) {
  const user = userEvent.setup();
  renderInWorkspace(<AgencyRequestDetailScreen requestId={requestId} />);
  const button = await screen.findByRole("button", { name: "Propose a worker" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("AgencyRequestsScreen", () => {
  it("lists matching open requests without family names", async () => {
    renderInWorkspace(<AgencyRequestsScreen />);
    const table = await screen.findByRole("table", { name: "Open requests" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("link", { name: "Part-time family driver" })).toHaveAttribute(
      "href",
      "/agency/requests/r-bola-driver",
    );
    expect(table).not.toHaveTextContent(/Martins|Okafor/);
  });
});

describe("Propose dialog", () => {
  it("shows busy workers greyed out with the reason, and only listed workers of the role", async () => {
    const { dialog } = await openProposeDialog("r-bola-driver");
    const musa = await within(dialog).findByRole("radio", { name: /Musa Ibrahim/ });
    const chinedu = within(dialog).getByRole("radio", { name: /Chinedu Okeke/ });
    expect(musa).toBeEnabled();
    expect(chinedu).toBeDisabled();
    expect(within(dialog).getByText(/In a placement/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Emeka Udo/)).toBeNull(); // draft, not listed
  });

  it("disables a worker who is already proposed for this request", async () => {
    const { dialog } = await openProposeDialog("r-ada-nanny");
    expect(await within(dialog).findByRole("radio", { name: /Amaka Obi.*Already proposed/ })).toBeDisabled();
  });

  it("proposes a worker and lists the proposal", async () => {
    const { user, dialog } = await openProposeDialog("r-bola-driver");
    await user.click(await within(dialog).findByRole("radio", { name: /Musa Ibrahim/ }));
    await user.type(within(dialog).getByLabelText(/Note for the family/), "Nine years driving families.");
    await user.click(within(dialog).getByRole("button", { name: "Propose worker" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const proposals = screen.getByRole("region", { name: "Your proposals" });
    expect(await within(proposals).findByText("Musa Ibrahim")).toBeInTheDocument();
    expect(within(proposals).getByText("Waiting for the family")).toBeInTheDocument();
  });

  it("explains a worker who was placed elsewhere a moment ago, and keeps the dialog open", async () => {
    server.use(
      http.post(`${env.NEXT_PUBLIC_API_BASE_URL}/requests/:id/proposals`, () =>
        errorResponse("WORKER_UNAVAILABLE", "Placed elsewhere"),
      ),
    );
    const { user, dialog } = await openProposeDialog("r-bola-driver");
    await user.click(await within(dialog).findByRole("radio", { name: /Musa Ibrahim/ }));
    await user.click(within(dialog).getByRole("button", { name: "Propose worker" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("This worker has just been placed with another family");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("asks for a worker before submitting", async () => {
    const { user, dialog } = await openProposeDialog("r-bola-driver");
    await within(dialog).findByRole("radio", { name: /Musa Ibrahim/ });
    await user.click(within(dialog).getByRole("button", { name: "Propose worker" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose a worker to propose.");
  });
});

describe("Placements", () => {
  it("lists the agency's placements with status badges", async () => {
    renderInWorkspace(<PlacementsListScreen viewer="agency_admin" />);
    const table = await screen.findByRole("table", { name: "Placements" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("Awaiting payment")).toBeInTheDocument();
  });

  it("shows the timeline and trial countdown, and ends a placement with a reason", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<PlacementDetailScreen placementId="p-blessing" viewer="agency_admin" />);
    expect(await screen.findByText(/Trial ends in 2 days/)).toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "End placement" }));
    const dialog = await screen.findByRole("dialog", { name: "End this placement?" });
    await user.click(within(dialog).getByRole("button", { name: "End placement" }));
    expect(await within(dialog).findByText("Say why the placement is ending.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "The family is relocating abroad.");
    await user.click(within(dialog).getByRole("button", { name: "End placement" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await within(timeline).findByText("Placement ended")).toBeInTheDocument();
    expect(within(timeline).getByText(/relocating abroad/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End placement" })).toBeNull();
  });

  it("offers no actions when the API allows none", async () => {
    renderInWorkspace(<PlacementDetailScreen placementId="p-musa" viewer="agency_admin" />);
    expect(await screen.findByText("Why it ended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End placement" })).toBeNull();
  });
});

describe("Billing and settings", () => {
  it("shows the subscription and payment history", async () => {
    renderInWorkspace(<AgencyBillingScreen />);
    expect(await screen.findByText("Agency monthly")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Payment history" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("shows the agency profile", async () => {
    renderInWorkspace(<AgencySettingsScreen />);
    expect(await screen.findByText("Sunrise Domestic Staffing")).toBeInTheDocument();
    expect(screen.getByText("RC 1234567")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
