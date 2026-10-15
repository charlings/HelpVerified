import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { paymentsApi } from "@/features/payments/api";
import { db } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { billingApi } from "../api";
import { AgencyBillingScreen } from "./AgencyBillingScreen";

const nav = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/agency/billing",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.push.mockReset();
  nav.params = new URLSearchParams();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Agency billing: subscribing (B7)", () => {
  it("a subscription can't be started twice: the mock refuses like the API", async () => {
    await signInAsDemo("agency@demo.hv");
    await expect(billingApi.startSubscription()).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("an active subscription offers Manage, not Subscribe", async () => {
    await signInAsDemo("agency@demo.hv");
    renderInWorkspace(<AgencyBillingScreen />);
    expect(await screen.findByRole("button", { name: "Manage subscription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
  });

  it("Subscribe opens the checkout for a new subscription payment", async () => {
    await signInAsDemo("agency@demo.hv");
    db.subscriptions = db.subscriptions.filter((s) => s.agency_id !== "a-sunrise");
    renderInWorkspace(<AgencyBillingScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Subscribe" }));

    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/demo\/checkout\?reference=HV-SUB-/)),
    );
    const reference = new URLSearchParams(String(nav.push.mock.calls[0]![0]).split("?")[1]).get("reference");
    expect(db.payments.find((p) => p.reference === reference)).toMatchObject({
      kind: "subscription",
      status: "pending",
    });
  });

  it("an agency that isn't approved yet is told why it can't subscribe", async () => {
    await signInAsDemo("pending@demo.hv");
    renderInWorkspace(<AgencyBillingScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Subscribe" }));
    expect(await screen.findByText(/needs to be approved/)).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("back from checkout, a paid subscription is confirmed with the API", async () => {
    await signInAsDemo("agency@demo.hv");
    db.subscriptions = db.subscriptions.filter((s) => s.agency_id !== "a-sunrise");
    const { reference } = await billingApi.startSubscription();
    await paymentsApi.demoCharge(reference);
    nav.params = new URLSearchParams({ reference });

    renderInWorkspace(<AgencyBillingScreen />);
    expect(await screen.findByText("Payment received")).toBeInTheDocument();
    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("back from checkout without paying, it says the subscription hasn't started", async () => {
    await signInAsDemo("agency@demo.hv");
    server.use(
      http.get(`${env.NEXT_PUBLIC_API_BASE_URL}/payments/:reference/verify`, ({ params }) =>
        HttpResponse.json({ reference: params.reference, status: "failed" }),
      ),
    );
    nav.params = new URLSearchParams({ reference: "HV-SUB-ABANDONED" });
    renderInWorkspace(<AgencyBillingScreen />);
    expect(await screen.findByText("The payment didn't go through")).toBeInTheDocument();
  });
});
