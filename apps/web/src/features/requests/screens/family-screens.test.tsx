import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { DemoCheckoutScreen } from "@/features/payments/screens/DemoCheckoutScreen";
import { PaymentCallbackScreen } from "@/features/payments/screens/PaymentCallbackScreen";
import { WorkerPublicProfileScreen } from "@/features/workers/screens/WorkerPublicProfileScreen";
import { db } from "@/mocks/db";
import { errorResponse } from "@/mocks/errors";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { renderInWorkspace, signInAsDemo } from "@/test/render";
import { familyRequestsApi } from "../family-api";
import { FamilyRequestDetailScreen } from "./FamilyRequestDetailScreen";
import { FamilyRequestsScreen } from "./FamilyRequestsScreen";
import { NewRequestScreen } from "./NewRequestScreen";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }));
// Vitest imports PNGs as plain strings (no width/height), which next/image rejects.
vi.mock("@/assets/brand", () => ({
  brand: {
    logoFull: { src: { src: "/logo.png", width: 1645, height: 356 }, alt: "HelpVerified" },
    logoMark: { src: { src: "/mark.png", width: 357, height: 356 }, alt: "HelpVerified" },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/family",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetAuthState();
  nav.push.mockReset();
  nav.params = new URLSearchParams();
  await signInAsDemo("family@demo.hv");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("FamilyRequestsScreen", () => {
  it("lists the family's requests with what needs reviewing", async () => {
    renderInWorkspace(<FamilyRequestsScreen />);
    const table = await screen.findByRole("table", { name: "Your requests" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("1 to review")).toBeInTheDocument();
  });

  it("invites a family with no requests to post one", async () => {
    resetAuthState();
    await signInAsDemo("newfamily@demo.hv");
    renderInWorkspace(<FamilyRequestsScreen />);
    expect(await screen.findByRole("heading", { name: "No requests yet" })).toBeInTheDocument();
  });
});

describe("NewRequestScreen", () => {
  it("prefills the role from the service page and validates each step", async () => {
    nav.params = new URLSearchParams({ role: "driver" });
    const user = userEvent.setup();
    renderInWorkspace(<NewRequestScreen />);
    expect(screen.getByRole("radio", { name: /^Driver/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter your local government area.")).toBeInTheDocument();
    expect(screen.getByText("Choose a start date.")).toBeInTheDocument();
  });

  it("posts a request and opens it", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<NewRequestScreen />);
    await user.click(screen.getByRole("radio", { name: /^Cleaner/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Local government area"), "Yaba");
    const start = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await user.type(screen.getByLabelText("Start date"), start);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Title"), "Cleaner for weekends");
    await user.type(
      screen.getByLabelText("What the role involves"),
      "Saturday and Sunday cleaning, laundry and ironing.",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Yaba, Lagos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Post request" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/family\/requests\/r-/)));
  }, 30_000);
});

describe("FamilyRequestDetailScreen", () => {
  it("shows proposals with the worker's verified checks, first name only", async () => {
    renderInWorkspace(<FamilyRequestDetailScreen requestId="r-ada-nanny" />);
    const card = await screen.findByRole("article", { name: "Amaka" });
    expect(within(card).getAllByText(/^(Identity|Guarantor|References|Address)/)).toHaveLength(4);
    expect(card).not.toHaveTextContent("Obi");
  });

  it("accepting sends the family to checkout", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<FamilyRequestDetailScreen requestId="r-ada-nanny" />);
    await user.click(await screen.findByRole("button", { name: "Accept Amaka" }));
    const dialog = await screen.findByRole("dialog", { name: "Accept Amaka?" });
    expect(dialog).toHaveTextContent("held for you for 30 minutes");
    await user.click(within(dialog).getByRole("button", { name: "Accept and pay" }));
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/demo\/checkout\?reference=HV-PF-/)),
    );
  });

  it("explains a worker who was placed with another family a moment earlier", async () => {
    server.use(
      http.post(`${env.NEXT_PUBLIC_API_BASE_URL}/proposals/:id/accept`, () =>
        errorResponse("WORKER_UNAVAILABLE", "Taken"),
      ),
    );
    const user = userEvent.setup();
    renderInWorkspace(<FamilyRequestDetailScreen requestId="r-ada-nanny" />);
    await user.click(await screen.findByRole("button", { name: "Accept Amaka" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Accept and pay" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This worker has just been placed with another family",
    );
  });

  it("declines a proposal", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<FamilyRequestDetailScreen requestId="r-ada-nanny" />);
    await user.click(await screen.findByRole("button", { name: "Decline Amaka" }));
    expect(await screen.findByText("Declined")).toBeInTheDocument();
  });

  it("cancels the request after confirming", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<FamilyRequestDetailScreen requestId="r-ada-nanny" />);
    await user.click(await screen.findByRole("button", { name: "Cancel request" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this request?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });
});

describe("Worker public profile", () => {
  it("shows checks with dates and the agency, never documents", async () => {
    renderInWorkspace(<WorkerPublicProfileScreen workerId="w-amaka" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Amaka" })).toBeInTheDocument();
    expect(screen.getAllByText(/^Verified /)).toHaveLength(4);
    expect(screen.getByText(/documents themselves stay private/)).toBeInTheDocument();
  });

  it("explains when the worker hasn't been proposed to this family", async () => {
    renderInWorkspace(<WorkerPublicProfileScreen workerId="w-fatima" />); // proposed only to another family
    expect(await screen.findByRole("heading", { level: 1, name: "Profile not available" })).toBeInTheDocument();
  });
});

describe("Payment", () => {
  async function acceptAmaka() {
    const { payment } = await familyRequestsApi.accept("pr-amaka-ada");
    return payment!.reference;
  }

  it("the demo checkout pays and returns to the callback", async () => {
    nav.params = new URLSearchParams({ reference: await acceptAmaka() });
    const user = userEvent.setup();
    renderInWorkspace(<DemoCheckoutScreen />);
    expect(await screen.findByText("No money moves")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Pay ₦20,000 \(demo\)/ }));
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/family\/payments\/callback\?reference=/)),
    );
  });

  it("the callback confirms a successful payment and links to the placement", async () => {
    const reference = await acceptAmaka();
    const { paymentsApi } = await import("@/features/payments/api");
    await paymentsApi.demoCharge(reference);
    nav.params = new URLSearchParams({ reference });
    renderInWorkspace(<PaymentCallbackScreen />);
    expect(await screen.findByRole("heading", { name: "Payment received" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your placement" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/family\/placements\/p-/),
    );
  });

  it("the callback explains a cancelled checkout and offers to return", async () => {
    nav.params = new URLSearchParams({ reference: await acceptAmaka(), cancelled: "1" });
    renderInWorkspace(<PaymentCallbackScreen />);
    expect(await screen.findByRole("heading", { name: "Payment not completed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to checkout" })).toBeInTheDocument();
  });

  it("the callback explains a refund when the hold ran out", async () => {
    const reference = await acceptAmaka();
    const placement = db.placements.find((p) => p.worker_id === "w-amaka")!;
    placement.hold_expires_at = new Date(Date.now() - 1000).toISOString();
    const { paymentsApi } = await import("@/features/payments/api");
    await paymentsApi.demoCharge(reference);
    nav.params = new URLSearchParams({ reference });
    renderInWorkspace(<PaymentCallbackScreen />);
    expect(await screen.findByRole("heading", { name: "Your payment will be refunded" })).toBeInTheDocument();
  });
});
