import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages } from "@/lib/error-messages";
import { db, DEMO_PASSWORD } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetAuthState } from "@/test/auth-helpers";
import { useSessionStore } from "../session";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { LoginScreen } from "./LoginScreen";
import { ResetPasswordScreen } from "./ResetPasswordScreen";
import { SignupScreen } from "./SignupScreen";
import { VerifyEmailScreen } from "./VerifyEmailScreen";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams(), pathname: "/login" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
  usePathname: () => nav.pathname,
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
});
afterAll(() => server.close());

async function signInWith(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("LoginScreen", () => {
  it("signs in and sends the user to a safe next path", async () => {
    nav.params = new URLSearchParams({ next: "/family/requests" });
    render(<LoginScreen />);
    await signInWith("family@demo.hv", DEMO_PASSWORD);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/family/requests"));
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", user: { role: "family" } });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Signing you in");
  });

  it("ignores a next path that belongs to another role", async () => {
    nav.params = new URLSearchParams({ next: "/admin" });
    render(<LoginScreen />);
    await signInWith("agency@demo.hv", DEMO_PASSWORD);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/agency"));
  });

  it("shows a focused error for wrong credentials", async () => {
    render(<LoginScreen />);
    await signInWith("family@demo.hv", "not-the-password");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(errorMessages.INVALID_CREDENTIALS!);
    expect(alert).toHaveFocus();
  });

  it("explains suspended accounts", async () => {
    render(<LoginScreen />);
    await signInWith("suspended@demo.hv", DEMO_PASSWORD);
    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.ACCOUNT_SUSPENDED!);
  });

  it("shows the session-expired notice", () => {
    nav.params = new URLSearchParams({ expired: "1" });
    render(<LoginScreen />);
    expect(screen.getByText(/session has expired/)).toBeInTheDocument();
  });

  it("validates fields before calling the API", async () => {
    render(<LoginScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/valid email address/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });
});

describe("SignupScreen", () => {
  async function fill(email: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Full name"), "Ngozi Ade");
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("preselects Family when arriving from a service page", () => {
    nav.params = new URLSearchParams({ role: "nanny" });
    render(<SignupScreen />);
    expect(screen.getByRole("radio", { name: /Hire help/ })).toBeChecked();
  });

  it("preselects Agency for ?role=agency", () => {
    nav.params = new URLSearchParams({ role: "agency" });
    render(<SignupScreen />);
    expect(screen.getByRole("radio", { name: /List my agency/ })).toBeChecked();
  });

  it("requires a role and the privacy notice", async () => {
    render(<SignupScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Choose how you'll use HelpVerified.")).toBeInTheDocument();
    expect(screen.getByText(/accept the privacy notice/)).toBeInTheDocument();
  });

  it("creates the account, records the privacy notice version and shows Check your email", async () => {
    nav.params = new URLSearchParams({ role: "nanny" });
    render(<SignupScreen />);
    await fill("ngozi@example.com");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toHaveFocus();
    expect(db.users.find((u) => u.email === "ngozi@example.com")?.privacy_notice_version).toBe("draft-2026-10-05");
  });

  it("offers sign-in when the email is taken", async () => {
    nav.params = new URLSearchParams({ role: "nanny" });
    render(<SignupScreen />);
    await fill("family@demo.hv");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(errorMessages.EMAIL_TAKEN!);
    expect(alert.querySelector("a")).toHaveAttribute("href", "/login");
  });
});

describe("ForgotPasswordScreen", () => {
  it("always confirms, without revealing whether the account exists", async () => {
    render(<ForgotPasswordScreen />);
    await userEvent.type(screen.getByLabelText("Email"), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toHaveFocus();
  });
});

describe("ResetPasswordScreen", () => {
  it("explains a link without a token", () => {
    render(<ResetPasswordScreen />);
    expect(screen.getByRole("heading", { name: /isn't valid/ })).toBeInTheDocument();
  });

  it("shows the expired state for a used or unknown token", async () => {
    nav.params = new URLSearchParams({ token: "nope" });
    render(<ResetPasswordScreen />);
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("heading", { name: /expired or has already been used/ })).toBeInTheDocument();
  });

  it("checks the confirmation matches", async () => {
    nav.params = new URLSearchParams({ token: "x" });
    render(<ResetPasswordScreen />);
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pass");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different-pass");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("The passwords don't match.")).toBeInTheDocument();
  });
});

describe("VerifyEmailScreen", () => {
  it("verifies an agency and continues to sign-in with onboarding next", async () => {
    db.oneTimeTokens.push({
      token: "agency-token",
      user_id: "u-unverified",
      purpose: "verify_email",
      expires_at: Date.now() + 60_000,
      used_at: null,
    });
    nav.params = new URLSearchParams({ token: "agency-token" });
    render(<VerifyEmailScreen />);
    const heading = await screen.findByRole("heading", { name: "Email verified" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/login?next=%2Fsignup%2Fagency");
  });

  it("offers a new link when the token has expired", async () => {
    nav.params = new URLSearchParams({ token: "unknown" });
    render(<VerifyEmailScreen />);
    expect(await screen.findByRole("heading", { name: /expired or has already been used/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeInTheDocument();
  });

  it("asks the user to check their inbox when there's no token", () => {
    render(<VerifyEmailScreen />);
    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
  });
});
