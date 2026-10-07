import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { errorMessages } from "@/lib/error-messages";
import { db } from "@/mocks/db";
import { errorResponse } from "@/mocks/errors";
import { server } from "@/mocks/server";
import { ContactForm } from "./ContactForm";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Ada Obi");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.selectOptions(screen.getByLabelText("What's this about?"), "family");
  await user.type(screen.getByLabelText("Message"), "I'd like help finding a live-in nanny in Ikeja.");
}

describe("ContactForm", () => {
  it("shows field errors on blur", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.click(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.tab();
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the first invalid field on submit", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveFocus();
  });

  it("submits and replaces the form with a focused success message", async () => {
    const user = userEvent.setup();
    const before = db.contactMessages.length;
    render(<ContactForm />);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    const heading = await screen.findByRole("heading", { name: /your message is on its way/ });
    expect(heading).toHaveFocus();
    expect(db.contactMessages).toHaveLength(before + 1);
  });

  it("maps server field errors back to the fields", async () => {
    server.use(
      http.post(`${env.NEXT_PUBLIC_API_BASE_URL}/contact`, () =>
        errorResponse("VALIDATION_ERROR", "Invalid", { email: ["This email address can't receive mail."] }),
      ),
    );
    const user = userEvent.setup();
    render(<ContactForm />);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("This email address can't receive mail.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("shows a focused form-level message for other errors", async () => {
    server.use(http.post(`${env.NEXT_PUBLIC_API_BASE_URL}/contact`, () => errorResponse("RATE_LIMITED", "Slow down")));
    const user = userEvent.setup();
    render(<ContactForm />);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(errorMessages.RATE_LIMITED!);
    expect(alert).toHaveFocus();
  });
});
