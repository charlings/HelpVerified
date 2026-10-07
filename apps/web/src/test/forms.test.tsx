/**
 * M8 forms rule (spec requirement 19): submitting with problems moves focus to the first invalid
 * field and shows its error; while a submission is in flight the submit button is disabled.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { env } from "@/config/env";
import { AgencyOnboardingScreen } from "@/features/auth/screens/AgencyOnboardingScreen";
import { ForgotPasswordScreen } from "@/features/auth/screens/ForgotPasswordScreen";
import { LoginScreen } from "@/features/auth/screens/LoginScreen";
import { ResetPasswordScreen } from "@/features/auth/screens/ResetPasswordScreen";
import { SignupScreen } from "@/features/auth/screens/SignupScreen";
import { ContactForm } from "@/features/marketing/contact/ContactForm";
import { NewRequestScreen } from "@/features/requests/screens/NewRequestScreen";
import { RejectDialog } from "@/features/verification/components/RejectDialog";
import { NewWorkerScreen } from "@/features/workers/screens/NewWorkerScreen";
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

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.params = new URLSearchParams();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Focus is on (or, for a radio group, inside) the first element marked invalid, in document order. */
async function expectFocusOnFirstInvalid() {
  await waitFor(() => {
    const first = document.querySelector('[aria-invalid="true"]');
    expect(first, "an invalid field").not.toBeNull();
    expect(first!.contains(document.activeElement), "focus is on the first invalid field").toBe(true);
  });
}

const submitButton = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const holdTheApi = () => server.use(http.all(`${base}/*`, () => delay("infinite")));

describe("focus moves to the first problem", () => {
  it.each([
    ["sign in", () => renderInWorkspace(<LoginScreen />)],
    ["sign up", () => renderInWorkspace(<SignupScreen />)],
    ["forgot password", () => renderInWorkspace(<ForgotPasswordScreen />)],
    ["contact", () => render(<ContactForm />)],
  ])("%s", async (_name, renderForm) => {
    const user = userEvent.setup();
    renderForm();
    await user.click(submitButton());
    await expectFocusOnFirstInvalid();
  });

  it("reset password", async () => {
    nav.params = new URLSearchParams({ token: "abc" });
    const user = userEvent.setup();
    renderInWorkspace(<ResetPasswordScreen />);
    await user.click(await screen.findByRole("button", { name: "Update password" }));
    await expectFocusOnFirstInvalid();
  });

  it("agency onboarding, first step", async () => {
    await signInAsDemo("newagency@demo.hv");
    const user = userEvent.setup();
    renderInWorkspace(<AgencyOnboardingScreen />);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await expectFocusOnFirstInvalid();
  });

  it("add worker, first step", async () => {
    await signInAsDemo("agency@demo.hv");
    const user = userEvent.setup();
    renderInWorkspace(<NewWorkerScreen />);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await expectFocusOnFirstInvalid();
  });

  it("new request, second step", async () => {
    await signInAsDemo("family@demo.hv");
    nav.params = new URLSearchParams({ role: "driver" });
    const user = userEvent.setup();
    renderInWorkspace(<NewRequestScreen />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await expectFocusOnFirstInvalid();
  });

  it("reason dialog (end, cancel, suspend, reject agency, flag)", async () => {
    const user = userEvent.setup();
    render(
      <ReasonDialog
        open
        onOpenChange={() => {}}
        title="End this placement?"
        hint="Both parties see this."
        missingReason="Say why the placement is ending."
        submitLabel="End placement"
        cancelLabel="Keep placement"
        onSubmit={async () => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "End placement" }));
    expect(await screen.findByText("Say why the placement is ending.")).toBeInTheDocument();
    await expectFocusOnFirstInvalid();
  });

  it("reject check dialog", async () => {
    const user = userEvent.setup();
    render(
      <RejectDialog open checkLabel="Address" wasVerified={false} onOpenChange={() => {}} onReject={async () => {}} />,
    );
    await user.click(screen.getByRole("button", { name: "Reject check" }));
    await expectFocusOnFirstInvalid();
  });
});

describe("submit is disabled while sending", () => {
  it("sign in", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<LoginScreen />);
    await user.type(screen.getByLabelText("Email"), "family@demo.hv");
    await user.type(screen.getByLabelText("Password", { exact: true }), "demo1234");
    holdTheApi();
    await user.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it("forgot password", async () => {
    const user = userEvent.setup();
    renderInWorkspace(<ForgotPasswordScreen />);
    await user.type(screen.getByLabelText("Email"), "family@demo.hv");
    holdTheApi();
    await user.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it("contact", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Your name"), "Ada Okafor");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.selectOptions(screen.getByLabelText("What's this about?"), "family");
    await user.type(screen.getByLabelText("Message"), "I'd like to know more about how the checks work.");
    holdTheApi();
    await user.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it("reason dialog", async () => {
    const user = userEvent.setup();
    render(
      <ReasonDialog
        open
        onOpenChange={() => {}}
        title="End this placement?"
        hint="Both parties see this."
        missingReason="Say why."
        submitLabel="End placement"
        cancelLabel="Keep placement"
        onSubmit={() => new Promise(() => {})}
      />,
    );
    await user.type(screen.getByLabelText("Reason"), "The family is relocating abroad.");
    await user.click(screen.getByRole("button", { name: "End placement" }));
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });
});
