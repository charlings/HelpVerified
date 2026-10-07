import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyDashboardScreen } from "@/features/agencies/screens/AgencyDashboardScreen";
import { db } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { NewWorkerScreen } from "./NewWorkerScreen";
import { WorkerDetailScreen } from "./WorkerDetailScreen";
import { WorkersListScreen } from "./WorkersListScreen";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
  pathname: "/agency/workers",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => nav.pathname,
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  await signInAsDemo("agency@demo.hv");
});
afterAll(() => server.close());

describe("WorkerDetailScreen", () => {
  it("disables List worker and says which checks are outstanding", async () => {
    renderInWorkspace(<WorkerDetailScreen workerId="w-joy" />);
    const button = await screen.findByRole("button", { name: "List worker" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleDescription(/1 check still to verify: Address/);
    expect(await screen.findByText("3 of 4 checks verified")).toBeInTheDocument();
  });

  it("lists a worker once the last check is verified", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<WorkerDetailScreen workerId="w-joy" />);
    const address = await screen.findByRole("region", { name: "Address" });
    await user.click(within(address).getByRole("button", { name: "Verify address" }));
    const list = await screen.findByRole("button", { name: "List worker" });
    await waitFor(() => expect(list).toBeEnabled());
    await user.click(list);
    expect(await screen.findByRole("button", { name: "Delist worker" })).toBeInTheDocument();
    expect(await screen.findByText(/Worker listed/)).toBeInTheDocument();
  });

  it("shows a rejected check's reason and blocks verifying without evidence", async () => {
    renderInWorkspace(<WorkerDetailScreen workerId="w-emeka" />);
    const guarantor = await screen.findByRole("region", { name: "Guarantor" });
    expect(within(guarantor).getByText(/phone number could not be reached/)).toBeInTheDocument();
    const address = screen.getByRole("region", { name: "Address" });
    const verify = within(address).getByRole("button", { name: "Verify address" });
    expect(verify).toBeDisabled();
    expect(verify).toHaveAccessibleDescription("Upload at least one document before verifying.");
  });

  it("says when a worker isn't part of the agency", async () => {
    renderInWorkspace(<WorkerDetailScreen workerId="w-zainab" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Worker not found" })).toBeInTheDocument();
  });
});

describe("WorkersListScreen", () => {
  it("lists the agency's workers with their checks and listing status", async () => {
    renderInWorkspace(<WorkersListScreen />);
    const table = await screen.findByRole("table", { name: "Workers" });
    expect(within(table).getAllByRole("row")).toHaveLength(11); // header + 10
    expect(within(table).getByRole("link", { name: "Joy Nwosu" })).toHaveAttribute("href", "/agency/workers/w-joy");
  });

  it("reads filters from the URL and offers to clear them when nothing matches", async () => {
    nav.params = new URLSearchParams({ role: "driver", listing_status: "suspended" });
    renderInWorkspace(<WorkersListScreen />);
    expect(await screen.findByRole("heading", { name: "No workers match these filters" })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(nav.replace).toHaveBeenCalledWith("/agency/workers", { scroll: false });
  });
});

describe("NewWorkerScreen", () => {
  async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Full name"), "Kola Adeyemi");
    await user.selectOptions(screen.getByLabelText("Role"), "driver");
    await user.type(screen.getByLabelText("Years of experience"), "4");
    await user.type(screen.getByLabelText("Local government area"), "Yaba");
    await user.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("validates the details step before moving on", async () => {
    renderInWorkspace(<NewWorkerScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter the worker's full name.")).toBeInTheDocument();
  });

  it("requires the worker's consent", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<NewWorkerScreen />);
    await fillDetails(user);
    await user.type(await screen.findByLabelText(/National Identification Number/), "12345678901");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Confirm the worker agreed/)).toBeInTheDocument();
  });

  it("sends a duplicate NIN back to the identity step with the error on the field", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<NewWorkerScreen />);
    await fillDetails(user);
    await user.type(await screen.findByLabelText(/National Identification Number/), "10000007919"); // Amaka's
    await user.click(screen.getByRole("checkbox", { name: /has agreed/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Add worker" }));
    expect(await screen.findByText(/already on HelpVerified/)).toBeInTheDocument();
    expect(screen.getByLabelText(/National Identification Number/)).toHaveFocus();
  }, 30_000);

  it("adds the worker and opens their checklist", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<NewWorkerScreen />);
    await fillDetails(user);
    await user.type(await screen.findByLabelText(/National Identification Number/), "22233344455");
    await user.click(screen.getByRole("checkbox", { name: /has agreed/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Ending 4455")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add worker" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/agency\/workers\/w-/)));
  }, 30_000);
});

describe("AgencyDashboardScreen", () => {
  it("shows worker counts and trials ending soon", async () => {
    renderInWorkspace(<AgencyDashboardScreen />);
    expect(await screen.findByRole("link", { name: /Listed workers/ })).toHaveTextContent("6");
    expect(screen.getByRole("link", { name: /Blessing Eze with the Okafor family/ })).toBeInTheDocument();
  });

  it("explains why listing is off for an agency awaiting approval", async () => {
    resetAuthState();
    db.agencies.push({ ...db.agencies[0]!, id: "a-new", admin_user_id: "u-newagency", status: "pending" });
    await signInAsDemo("newagency@demo.hv");
    renderInWorkspace(<AgencyDashboardScreen />);
    expect(await screen.findByText("Your agency is waiting for approval")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No workers yet" })).toBeInTheDocument();
  });
});
