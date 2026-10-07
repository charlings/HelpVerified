import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/mocks/db";
import { MOCK_REFRESH_COOKIE } from "@/mocks/cookies";
import { server } from "@/mocks/server";
import { resetAuthState, setCookie } from "@/test/auth-helpers";
import { AgencyOnboardingScreen } from "./AgencyOnboardingScreen";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }) }));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.replace.mockReset();
});
afterAll(() => server.close());

describe("AgencyOnboardingScreen", () => {
  it("sends signed-out visitors to sign in with onboarding as next", async () => {
    render(<AgencyOnboardingScreen />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Fsignup%2Fagency"));
  });

  it("validates each step and submits for review", async () => {
    setCookie(MOCK_REFRESH_COOKIE, "demo-refresh-newagency");
    const user = userEvent.setup();
    render(<AgencyOnboardingScreen />);
    await screen.findByRole("heading", { level: 2, name: "Business details" });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter your agency's registered name.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Registered business name"), "Bright Hands Agency");
    await user.type(screen.getByLabelText("CAC registration number"), "RC 7654321");
    await user.type(screen.getByLabelText("Business email"), "office@brighthands.demo");
    await user.type(screen.getByLabelText("Business phone"), "0805 123 4567");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Address and roles" })).toHaveFocus();
    await user.type(screen.getByLabelText("Office address"), "4 Admiralty Way");
    await user.selectOptions(screen.getByLabelText("State"), "Lagos");
    await user.type(screen.getByLabelText("Local government area"), "Eti-Osa");
    await user.click(screen.getByRole("checkbox", { name: "Nannies" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Review" })).toBeInTheDocument();
    expect(screen.getByText("Bright Hands Agency")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(await screen.findByRole("heading", { name: "Application received" })).toHaveFocus();
    expect(db.agencies.find((a) => a.admin_user_id === "u-newagency")).toMatchObject({
      status: "pending",
      phone: "08051234567",
    });
  }, 30_000);

  it("asks unverified admins to verify their email first", async () => {
    db.refreshTokens["refresh-unverified"] = { user_id: "u-unverified", revoked: false };
    setCookie(MOCK_REFRESH_COOKIE, "refresh-unverified");
    render(<AgencyOnboardingScreen />);
    expect(await screen.findByText("Verify your email first")).toBeInTheDocument();
  });

  it("shows the submitted state when the agency already exists", async () => {
    setCookie(MOCK_REFRESH_COOKIE, "demo-refresh-agency_admin");
    render(<AgencyOnboardingScreen />);
    expect(await screen.findByRole("heading", { name: "Application received" })).toBeInTheDocument();
  });
});
