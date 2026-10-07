/** M8 states matrix: empty states not already covered by a screen's own tests. */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { AdminAgenciesScreen } from "@/features/admin/screens/AdminAgenciesScreen";
import { AdminAuditLogScreen } from "@/features/admin/screens/AdminAuditLogScreen";
import { PlacementsListScreen } from "@/features/placements/screens/PlacementsListScreen";
import { AgencyRequestsScreen } from "@/features/requests/screens/AgencyRequestsScreen";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/",
}));

const base = env.NEXT_PUBLIC_API_BASE_URL;
const empty = () => HttpResponse.json({ items: [], page: 1, page_size: 20, total: 0 });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.params = new URLSearchParams();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("empty states", () => {
  it("admin agencies: nothing awaiting approval", async () => {
    await signInAsDemo("admin@demo.hv");
    nav.params = new URLSearchParams({ status: "pending" });
    server.use(http.get(`${base}/admin/agencies`, empty));
    renderInWorkspace(<AdminAgenciesScreen />);
    expect(
      await screen.findByRole("heading", { name: "No agencies awaiting approval" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("New applications appear here.")).toBeInTheDocument();
  });

  it("audit log: nothing recorded yet", async () => {
    await signInAsDemo("admin@demo.hv");
    server.use(http.get(`${base}/admin/audit-log`, empty));
    renderInWorkspace(<AdminAuditLogScreen />);
    expect(await screen.findByRole("heading", { name: "Nothing recorded yet" }, { timeout: 5000 })).toBeInTheDocument();
  });

  it.each([
    ["agency@demo.hv", "agency_admin", "once a family accepts one of your proposals"],
    ["newfamily@demo.hv", "family", "once you accept a proposal"],
    ["admin@demo.hv", "super_admin", "once a family accepts a proposal"],
  ] as const)("placements for %s: none yet, with what happens next", async (email, viewer, body) => {
    await signInAsDemo(email);
    server.use(http.get(`${base}/placements`, empty));
    renderInWorkspace(<PlacementsListScreen viewer={viewer} />);
    expect(await screen.findByRole("heading", { name: "No placements yet" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(body))).toBeInTheDocument();
  });

  it("placements: none with the chosen status", async () => {
    await signInAsDemo("agency@demo.hv");
    const user = userEvent.setup();
    renderInWorkspace(<PlacementsListScreen viewer="agency_admin" />);
    await screen.findByRole("table", { name: "Placements" }, { timeout: 5000 });
    server.use(http.get(`${base}/placements`, empty));
    await user.selectOptions(screen.getByLabelText("Status"), "cancelled");
    expect(
      await screen.findByRole("heading", { name: "No placements with this status" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("agency requests: none open right now", async () => {
    await signInAsDemo("agency@demo.hv");
    server.use(http.get(`${base}/requests`, empty));
    renderInWorkspace(<AgencyRequestsScreen />);
    expect(
      await screen.findByRole("heading", { name: "No open requests right now" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
