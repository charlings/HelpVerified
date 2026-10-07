import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { errorResponse } from "@/mocks/errors";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { AdminAgenciesScreen } from "./AdminAgenciesScreen";
import { AdminAgencyDetailScreen } from "./AdminAgencyDetailScreen";
import { AdminOverviewScreen } from "./AdminOverviewScreen";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/admin/agencies",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  await signInAsDemo("admin@demo.hv");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AdminOverviewScreen", () => {
  it("shows the numbers, the approval queue and recent activity", async () => {
    renderInWorkspace(<AdminOverviewScreen />);
    expect(await screen.findByRole("link", { name: /Agencies awaiting approval\s*1/ })).toHaveAttribute(
      "href",
      "/admin/agencies?status=pending",
    );
    const queue = screen.getByRole("region", { name: "Awaiting approval" });
    expect(within(queue).getByRole("link", { name: "Bright Hands Agency" })).toHaveAttribute(
      "href",
      "/admin/agencies/a-brighthands",
    );
    const activity = screen.getByRole("region", { name: "Recent admin activity" });
    expect(within(activity).getByText(/Suspended agency/)).toBeInTheDocument();
    expect(within(activity).getByText(/CAC registration lapsed/)).toBeInTheDocument();
  });

  it("shows an error with retry when the overview fails", async () => {
    server.use(http.get(`${env.NEXT_PUBLIC_API_BASE_URL}/admin/overview`, () => errorResponse("INTERNAL_ERROR", "x")));
    renderInWorkspace(<AdminOverviewScreen />);
    // Server errors are retried once (about a second) before the error state shows.
    expect(await screen.findByRole("button", { name: "Try again" }, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe("AdminAgenciesScreen", () => {
  it("lists every agency, pending first", async () => {
    renderInWorkspace(<AdminAgenciesScreen />);
    const table = await screen.findByRole("table", { name: "Agencies" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Bright Hands Agency");
    expect(rows[0]).toHaveTextContent("Awaiting approval");
  });

  it("filters by the status in the URL and changes it", async () => {
    nav.params = new URLSearchParams({ status: "suspended" });
    const user = userEvent.setup();
    renderInWorkspace(<AdminAgenciesScreen />);
    const table = await screen.findByRole("table", { name: "Agencies" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(table).toHaveTextContent("Harbour Care Services");
    await user.selectOptions(screen.getByLabelText("Status"), "pending");
    expect(nav.replace).toHaveBeenCalledWith("/admin/agencies?status=pending");
  });

  it("explains an empty filter", async () => {
    nav.params = new URLSearchParams({ status: "rejected" });
    renderInWorkspace(<AdminAgenciesScreen />);
    expect(await screen.findByRole("heading", { name: "No agencies with this status" })).toBeInTheDocument();
  });
});

describe("AdminAgencyDetailScreen", () => {
  it("shows the application and offers approve or reject", async () => {
    renderInWorkspace(<AdminAgencyDetailScreen agencyId="a-brighthands" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Bright Hands Agency" })).toBeInTheDocument();
    expect(screen.getByText("RC 3456789")).toBeInTheDocument();
    expect(screen.getByText(/Femi Olawale/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  });

  it("approves after confirmation", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminAgencyDetailScreen agencyId="a-brighthands" />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve Bright Hands Agency?" });
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Approved", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "History" });
    expect(within(history).getByText(/Approved agency/)).toBeInTheDocument();
  });

  it("cancelling the dialog changes nothing", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminAgencyDetailScreen agencyId="a-brighthands" />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Awaiting approval", { selector: "span" })).toBeInTheDocument();
  });

  it("suspending needs a reason, which is then shown", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminAgencyDetailScreen agencyId="a-sunrise" />);
    await user.click(await screen.findByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog", { name: "Suspend Sunrise Domestic Staffing?" });
    expect(dialog).toHaveTextContent("Placements already running continue");
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await within(dialog).findByText("Give a reason. The agency will see it.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "Complaints under investigation.");
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await screen.findByText("Suspended", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Complaints under investigation.", { selector: "div *" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reinstate" })).toBeInTheDocument();
  });

  it("explains when another admin acted first", async () => {
    server.use(
      http.post(`${env.NEXT_PUBLIC_API_BASE_URL}/admin/agencies/:id/approve`, () =>
        errorResponse("ILLEGAL_TRANSITION", "Already approved."),
      ),
    );
    const user = userEvent.setup();
    renderInWorkspace(<AdminAgencyDetailScreen agencyId="a-brighthands" />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("isn't available any more");
  });

  it("shows not found for an unknown agency", async () => {
    renderInWorkspace(<AdminAgencyDetailScreen agencyId="a-nope" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Agency not found" })).toBeInTheDocument();
  });
});
