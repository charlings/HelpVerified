/**
 * M8 states matrix (plan decision 5): every data screen, with the API held open and with the API
 * failing. While loading it must show a labelled loading region and keep its one h1; on failure it
 * must show an error with "Try again" and keep its one h1. Empty states are tested per screen.
 */
import { screen } from "@testing-library/react";
import { delay, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { AdminAgenciesScreen } from "@/features/admin/screens/AdminAgenciesScreen";
import { AdminAgencyDetailScreen } from "@/features/admin/screens/AdminAgencyDetailScreen";
import { AdminAuditLogScreen } from "@/features/admin/screens/AdminAuditLogScreen";
import { AdminOverviewScreen } from "@/features/admin/screens/AdminOverviewScreen";
import { AdminWorkerDetailScreen } from "@/features/admin/screens/AdminWorkerDetailScreen";
import { AdminWorkersScreen } from "@/features/admin/screens/AdminWorkersScreen";
import { AgencyDashboardScreen } from "@/features/agencies/screens/AgencyDashboardScreen";
import { AgencySettingsScreen } from "@/features/agencies/screens/AgencySettingsScreen";
import { AgencyBillingScreen } from "@/features/billing/screens/AgencyBillingScreen";
import { FamilyPaymentsScreen } from "@/features/billing/screens/FamilyPaymentsScreen";
import { FamilyDashboardScreen } from "@/features/families/screens/FamilyDashboardScreen";
import { FamilySettingsScreen } from "@/features/families/screens/FamilySettingsScreen";
import { DemoCheckoutScreen } from "@/features/payments/screens/DemoCheckoutScreen";
import { PaymentCallbackScreen } from "@/features/payments/screens/PaymentCallbackScreen";
import { PlacementDetailScreen } from "@/features/placements/screens/PlacementDetailScreen";
import { PlacementsListScreen } from "@/features/placements/screens/PlacementsListScreen";
import { AgencyRequestDetailScreen } from "@/features/requests/screens/AgencyRequestDetailScreen";
import { AgencyRequestsScreen } from "@/features/requests/screens/AgencyRequestsScreen";
import { FamilyRequestDetailScreen } from "@/features/requests/screens/FamilyRequestDetailScreen";
import { FamilyRequestsScreen } from "@/features/requests/screens/FamilyRequestsScreen";
import { WorkerDetailScreen } from "@/features/workers/screens/WorkerDetailScreen";
import { WorkerPublicProfileScreen } from "@/features/workers/screens/WorkerPublicProfileScreen";
import { WorkersListScreen } from "@/features/workers/screens/WorkersListScreen";
import { errorResponse } from "@/mocks/errors";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";

vi.mock("@/assets/brand", () => ({
  brand: {
    logoFull: { src: { src: "/logo.png", width: 1645, height: 356 }, alt: "HelpVerified" },
    logoMark: { src: { src: "/mark.png", width: 357, height: 356 }, alt: "HelpVerified" },
  },
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/",
}));

const base = env.NEXT_PUBLIC_API_BASE_URL;
const FAMILY = "family@demo.hv";
const AGENCY = "agency@demo.hv";
const ADMIN = "admin@demo.hv";

type Case = { name: string; as: string; ui: () => React.ReactElement; params?: Record<string, string> };

const cases: Case[] = [
  // Family
  { name: "family dashboard", as: FAMILY, ui: () => <FamilyDashboardScreen /> },
  { name: "family requests", as: FAMILY, ui: () => <FamilyRequestsScreen /> },
  { name: "family request detail", as: FAMILY, ui: () => <FamilyRequestDetailScreen requestId="r-ada-nanny" /> },
  { name: "worker public profile", as: FAMILY, ui: () => <WorkerPublicProfileScreen workerId="w-amaka" /> },
  { name: "family placements", as: FAMILY, ui: () => <PlacementsListScreen viewer="family" /> },
  {
    name: "family placement",
    as: FAMILY,
    ui: () => <PlacementDetailScreen placementId="p-blessing" viewer="family" />,
  },
  { name: "family payments", as: FAMILY, ui: () => <FamilyPaymentsScreen /> },
  { name: "family settings", as: FAMILY, ui: () => <FamilySettingsScreen /> },
  {
    name: "payment callback",
    as: FAMILY,
    ui: () => <PaymentCallbackScreen />,
    params: { reference: "HV-PF-PF-BLESSING" },
  },
  {
    name: "demo checkout",
    as: "bola@demo.hv",
    ui: () => <DemoCheckoutScreen />,
    params: { reference: "HV-PF-PF-GRACE" },
  },
  // Agency
  { name: "agency dashboard", as: AGENCY, ui: () => <AgencyDashboardScreen /> },
  { name: "agency workers", as: AGENCY, ui: () => <WorkersListScreen /> },
  { name: "agency worker", as: AGENCY, ui: () => <WorkerDetailScreen workerId="w-amaka" /> },
  { name: "agency requests", as: AGENCY, ui: () => <AgencyRequestsScreen /> },
  { name: "agency request detail", as: AGENCY, ui: () => <AgencyRequestDetailScreen requestId="r-ada-nanny" /> },
  { name: "agency placements", as: AGENCY, ui: () => <PlacementsListScreen viewer="agency_admin" /> },
  {
    name: "agency placement",
    as: AGENCY,
    ui: () => <PlacementDetailScreen placementId="p-blessing" viewer="agency_admin" />,
  },
  { name: "agency billing", as: AGENCY, ui: () => <AgencyBillingScreen /> },
  { name: "agency settings", as: AGENCY, ui: () => <AgencySettingsScreen /> },
  // Admin
  { name: "admin overview", as: ADMIN, ui: () => <AdminOverviewScreen /> },
  { name: "admin agencies", as: ADMIN, ui: () => <AdminAgenciesScreen /> },
  { name: "admin agency", as: ADMIN, ui: () => <AdminAgencyDetailScreen agencyId="a-sunrise" /> },
  { name: "admin workers", as: ADMIN, ui: () => <AdminWorkersScreen /> },
  { name: "admin worker", as: ADMIN, ui: () => <AdminWorkerDetailScreen workerId="w-amaka" /> },
  { name: "admin placements", as: ADMIN, ui: () => <PlacementsListScreen viewer="super_admin" /> },
  {
    name: "admin placement",
    as: ADMIN,
    ui: () => <PlacementDetailScreen placementId="p-blessing" viewer="super_admin" />,
  },
  { name: "admin audit log", as: ADMIN, ui: () => <AdminAuditLogScreen /> },
];

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.params = new URLSearchParams();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function prepare(c: Case) {
  await signInAsDemo(c.as);
  nav.params = new URLSearchParams(c.params ?? {});
}

describe.each(cases)("$name", (c) => {
  it("while loading: a labelled loading region and one h1", async () => {
    await prepare(c);
    server.use(http.all(`${base}/*`, () => delay("infinite")));
    renderInWorkspace(c.ui());
    const regions = await screen.findAllByRole("status", { busy: true });
    for (const region of regions) expect(region).toHaveTextContent(/Loading|Checking|Verifying/i);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("when the API fails: an error with Try again, and one h1", async () => {
    await prepare(c);
    server.use(http.all(`${base}/*`, () => errorResponse("INTERNAL_ERROR", "Mock failure.")));
    renderInWorkspace(c.ui());
    // Server errors are retried once (about a second) before the error shows.
    expect((await screen.findAllByRole("button", { name: "Try again" }, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText("INTERNAL_ERROR")).toBeNull();
  }, 15_000);
});
