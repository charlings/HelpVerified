import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pricing } from "@/content/pages";
import { PricingScreen } from "./PricingScreen";

describe("PricingScreen", () => {
  it("never shows an amount while prices are unconfirmed", () => {
    expect(pricing.plans.every((p) => p.amountKobo === null)).toBe(true);
    const { container } = render(<PricingScreen />);
    expect(container.textContent).not.toMatch(/₦|NGN\s?\d/);
    expect(screen.getAllByText(pricing.priceToBeConfirmed)).toHaveLength(pricing.plans.length);
  });
});
