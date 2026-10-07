import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacementDetailScreen } from "@/features/placements/screens/PlacementDetailScreen";
import { PlacementsListScreen } from "@/features/placements/screens/PlacementsListScreen";
import { db } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { AdminAuditLogScreen } from "./AdminAuditLogScreen";
import { AdminWorkerDetailScreen } from "./AdminWorkerDetailScreen";
import { AdminWorkersScreen } from "./AdminWorkersScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  await signInAsDemo("admin@demo.hv");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AdminWorkersScreen", () => {
  it("lists workers from every agency and filters by agency", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminWorkersScreen />);
    const table = await screen.findByRole("table", { name: "Workers" });
    expect(table).toHaveTextContent("Sunrise Domestic Staffing");
    expect(table).toHaveTextContent("Kano Home Helpers");
    await screen.findByRole("option", { name: "Kano Home Helpers" });
    await user.selectOptions(screen.getByLabelText("Agency"), "a-kano");
    await waitFor(() => expect(screen.getByRole("table", { name: "Workers" })).not.toHaveTextContent("Sunrise"));
  });

  it("explains when filters match nothing", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminWorkersScreen />);
    await screen.findByRole("table", { name: "Workers" });
    await user.selectOptions(screen.getByLabelText("Listing"), "suspended");
    expect(await screen.findByRole("heading", { name: "No workers match these filters" })).toBeInTheDocument();
  });
});

describe("AdminWorkerDetailScreen", () => {
  it("shows the four checks read-only, with Flag on verified ones", async () => {
    renderInWorkspace(<AdminWorkerDetailScreen workerId="w-amaka" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Amaka Obi" })).toBeInTheDocument();
    expect(screen.getByText("4 of 4 verified")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Flag / })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /^Verify/ })).toBeNull();
    expect(screen.queryByLabelText(/Upload/)).toBeNull();
  });

  it("opening a document records it in the audit log", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminWorkerDetailScreen workerId="w-amaka" />);
    const view = await screen.findAllByRole("button", { name: /^View / });
    await user.click(view[0]!);
    await screen.findByRole("dialog");
    await waitFor(() => expect(db.auditLog[0]?.action).toBe("document.viewed"));
  });

  it("flags a check with a reason; the worker is delisted", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminWorkerDetailScreen workerId="w-amaka" />);
    await user.click(await screen.findByRole("button", { name: "Flag address" }));
    const dialog = await screen.findByRole("dialog", { name: "Flag Amaka Obi's address check?" });
    await user.click(within(dialog).getByRole("button", { name: "Flag check" }));
    expect(await within(dialog).findByText(/Say what needs re-checking/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "Utility bill is for a different street.");
    await user.click(within(dialog).getByRole("button", { name: "Flag check" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("3 of 4 verified")).toBeInTheDocument();
    expect(screen.getByText("Delisted", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Utility bill is for a different street.")).toBeInTheDocument();
  });

  it("shows not found for an unknown worker", async () => {
    renderInWorkspace(<AdminWorkerDetailScreen workerId="w-nope" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Worker not found" })).toBeInTheDocument();
  });
});

describe("Admin placements", () => {
  it("lists every placement with both the family and the agency", async () => {
    renderInWorkspace(<PlacementsListScreen viewer="super_admin" />);
    const table = await screen.findByRole("table", { name: "Placements" });
    expect(within(table).getByRole("columnheader", { name: "Family" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Agency" })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Blessing Eze" })).toHaveAttribute(
      "href",
      "/admin/placements/p-blessing",
    );
  });

  it("an admin can end a placement with a reason", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<PlacementDetailScreen placementId="p-blessing" viewer="super_admin" />);
    expect(await screen.findByText("Nanny · Sunrise Domestic Staffing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm placement" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "End placement" }));
    const dialog = await screen.findByRole("dialog", { name: "End this placement?" });
    await user.type(within(dialog).getByLabelText("Reason"), "Safeguarding concern reported to us.");
    await user.click(within(dialog).getByRole("button", { name: "End placement" }));
    expect(await screen.findByText("Ended by HelpVerified")).toBeInTheDocument();
  });
});

describe("AdminAuditLogScreen", () => {
  it("lists entries with who, what and a link to the record", async () => {
    renderInWorkspace(<AdminAuditLogScreen />);
    const table = await screen.findByRole("table", { name: "Audit log" });
    // Newest first: Harbour's suspension, then its approval further down.
    expect(within(table).getAllByRole("link", { name: "Harbour Care Services" })[0]).toHaveAttribute(
      "href",
      "/admin/agencies/a-harbour",
    );
    expect(table).toHaveTextContent("HelpVerified Admin (Admin)");
  });

  it("filters by action", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<AdminAuditLogScreen />);
    await screen.findByRole("table", { name: "Audit log" });
    await user.selectOptions(screen.getByLabelText("Action"), "worker.check_flagged");
    expect(await screen.findByRole("heading", { name: "Nothing recorded for this action" })).toBeInTheDocument();
  });
});
