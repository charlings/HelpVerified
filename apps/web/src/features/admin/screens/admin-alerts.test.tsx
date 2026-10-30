import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { raiseAlert } from "@/mocks/admin-domain";
import { db } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { AdminAlertsScreen } from "./AdminAlertsScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/alerts",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  db.alerts.splice(0);
  await signInAsDemo("admin@demo.hv");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AdminAlertsScreen", () => {
  it("says so when nothing needs attention", async () => {
    renderInWorkspace(<AdminAlertsScreen />);
    expect(await screen.findByRole("heading", { name: "Nothing needs attention" })).toBeInTheDocument();
  });

  it("acknowledging keeps the alert unresolved", async () => {
    raiseAlert("late_payment", "pay-1", "HV-PF-LATE");
    const user = userEvent.setup();
    renderInWorkspace(<AdminAlertsScreen />);
    const list = await screen.findByRole("list", { name: "Alerts" });
    expect(list).toHaveTextContent("Paid after the hold ended");
    expect(list).toHaveTextContent("HV-PF-LATE");

    await user.click(within(list).getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => expect(screen.getByRole("list", { name: "Alerts" })).toHaveTextContent("Acknowledged"));
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    expect(db.auditLog[0]?.action).toBe("alert.acknowledged");
  });

  it("resolving needs a note and records it", async () => {
    raiseAlert("refund_attention", "pay-2", "HV-PF-REFUND");
    const user = userEvent.setup();
    renderInWorkspace(<AdminAlertsScreen />);
    await user.click(await screen.findByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Paystack refund ID/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Resolve" }));
    expect(await within(dialog).findByText("Say what you checked or did, so the next admin knows.")).toBeVisible();
    await waitFor(() => expect(within(dialog).getByLabelText(/Resolution note/)).toHaveFocus());

    await user.type(within(dialog).getByLabelText(/Resolution note/), "Refund confirmed in the dashboard.");
    await user.click(within(dialog).getByRole("button", { name: "Resolve" }));

    expect(await screen.findByRole("heading", { name: "Nothing needs attention" })).toBeInTheDocument();
    expect(db.alerts[0]?.resolution_note).toBe("Refund confirmed in the dashboard.");
    expect(db.auditLog[0]?.action).toBe("alert.resolved");
  });

  it("rejects a refund ID that isn't a number", async () => {
    raiseAlert("refund_stuck", "pay-3", "HV-PF-STUCK");
    const user = userEvent.setup();
    renderInWorkspace(<AdminAlertsScreen />);
    await user.click(await screen.findByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Resolution note/), "Checked the dashboard.");
    await user.type(within(dialog).getByLabelText(/Paystack refund ID/), "rf_123");
    await user.click(within(dialog).getByRole("button", { name: "Resolve" }));

    expect(await within(dialog).findByText(/Enter the numeric refund ID/)).toBeVisible();
    expect(db.alerts[0]?.resolved_at).toBeNull();
  });
});
