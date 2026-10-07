import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./PasswordInput";
import { RadioCards } from "./RadioCards";
import { Stepper } from "./Stepper";

describe("PasswordInput", () => {
  it("toggles visibility with a pressed-state button", async () => {
    render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" />
      </>,
    );
    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("RadioCards", () => {
  it("is a labelled radio group operable with arrow keys", async () => {
    render(
      <RadioCards
        name="role"
        legend="I want to"
        options={[
          { value: "a", label: "Hire help" },
          { value: "b", label: "List workers" },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "I want to" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Hire help" }));
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "List workers" })).toBeChecked();
  });
});

describe("Stepper", () => {
  it("marks the current step and describes the others", () => {
    render(<Stepper steps={["One", "Two", "Three"]} current={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveTextContent("(completed)");
    expect(items[2]).toHaveTextContent("(not started)");
  });
});
