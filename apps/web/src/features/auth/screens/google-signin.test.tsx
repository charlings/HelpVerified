import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { authCopy } from "@/content/auth";
import { MOCK_REFRESH_COOKIE } from "@/mocks/cookies";
import { db } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetAuthState, setCookie } from "@/test/auth-helpers";
import { googleStartUrl } from "../components/GoogleButton";
import { useSessionStore } from "../session";
import { GoogleSignupScreen } from "./GoogleSignupScreen";
import { LoginScreen } from "./LoginScreen";

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/login",
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
});
afterAll(() => server.close());

describe("Google start link", () => {
  it("passes a safe next path to the API and drops unsafe ones", () => {
    const start = `${env.NEXT_PUBLIC_API_BASE_URL}/auth/google/start`;
    expect(googleStartUrl()).toBe(start);
    expect(googleStartUrl("/family/requests?tab=open")).toBe(`${start}?next=%2Ffamily%2Frequests%3Ftab%3Dopen`);
    expect(googleStartUrl("//evil.example")).toBe(start);
    expect(googleStartUrl("/pricing")).toBe(start);
  });
});

describe("LoginScreen after Google", () => {
  it("explains a Google error in a focused alert", async () => {
    nav.params = new URLSearchParams({ google_error: "cancelled" });
    render(<LoginScreen />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(authCopy.google.errorTitle);
    expect(alert).toHaveTextContent(authCopy.google.errors.cancelled!);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("falls back to a generic message for an unknown code", async () => {
    nav.params = new URLSearchParams({ google_error: "something-new" });
    render(<LoginScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(authCopy.google.unknownError);
  });

  it("restores the session from the refresh cookie and follows a safe next path", async () => {
    setCookie(MOCK_REFRESH_COOKIE, "demo-refresh-family");
    nav.params = new URLSearchParams({ google: "signed_in", next: "/family/requests" });
    render(<LoginScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(authCopy.login.redirecting);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/family/requests"));
    expect(useSessionStore.getState()).toMatchObject({ status: "authenticated", user: { role: "family" } });
  });

  it("says so if the session can't be restored", async () => {
    nav.params = new URLSearchParams({ google: "signed_in" });
    render(<LoginScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(authCopy.google.restoreFailed);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("GoogleSignupScreen", () => {
  const copy = authCopy.googleSignup;

  function pending(email = "ada@gmail.com", full_name: string | null = "Ada Okafor") {
    db.googlePending = { email, full_name };
  }

  async function choose(role: "Hire help" | "List my agency's workers") {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: new RegExp(role) }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: copy.submit }));
    return user;
  }

  it("asks to start again when there's no pending Google sign-in", async () => {
    render(<GoogleSignupScreen />);
    expect(await screen.findByRole("heading", { name: copy.expiredTitle })).toHaveFocus();
    expect(screen.getByRole("button", { name: authCopy.google.label })).toBeInTheDocument();
  });

  it("shows the Google email and pre-fills the name", async () => {
    pending();
    render(<GoogleSignupScreen />);
    expect(await screen.findByText(copy.subtitle("ada@gmail.com"))).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Okafor");
  });

  it("validates the role and privacy notice before calling the API", async () => {
    pending("ada@gmail.com", null);
    render(<GoogleSignupScreen />);
    await userEvent.click(await screen.findByRole("button", { name: copy.submit }));
    expect(await screen.findByText(/Choose how you'll use HelpVerified/)).toBeInTheDocument();
    expect(screen.getByText(/Enter your full name/)).toBeInTheDocument();
    expect(screen.getByText(/accept the privacy notice/)).toBeInTheDocument();
    expect(db.googlePending).not.toBeNull();
  });

  it("creates a verified family account, signs in and goes home", async () => {
    pending();
    render(<GoogleSignupScreen />);
    await choose("Hire help");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/family"));
    expect(useSessionStore.getState()).toMatchObject({
      status: "authenticated",
      user: { email: "ada@gmail.com", role: "family", email_verified: true },
    });
    expect(db.googlePending).toBeNull();
  });

  it("sends a new agency admin to agency onboarding", async () => {
    pending();
    render(<GoogleSignupScreen />);
    await choose("List my agency's workers");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signup/agency"));
  });

  it("offers sign-in when the email was registered meanwhile", async () => {
    pending("family@demo.hv");
    render(<GoogleSignupScreen />);
    await choose("Hire help");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.failedTitle);
    expect(alert).toContainElement(screen.getByRole("link", { name: authCopy.signup.signIn }));
  });

  it("shows the expired state if the pending sign-up lapses before submitting", async () => {
    pending();
    render(<GoogleSignupScreen />);
    await screen.findByLabelText("Full name");
    db.googlePending = null;
    await choose("Hire help");
    expect(await screen.findByRole("heading", { name: copy.expiredTitle })).toBeInTheDocument();
  });
});
