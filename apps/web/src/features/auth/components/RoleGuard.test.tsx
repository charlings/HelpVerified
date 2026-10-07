import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_REFRESH_COOKIE } from "@/mocks/cookies";
import { server } from "@/mocks/server";
import { resetAuthState, setCookie } from "@/test/auth-helpers";
import { RoleGuard } from "./RoleGuard";

const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/family/requests" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  resetAuthState();
  nav.replace.mockReset();
});
afterAll(() => server.close());

describe("RoleGuard", () => {
  it("shows a loading state, then the workspace for the right role", async () => {
    setCookie(MOCK_REFRESH_COOKIE, "demo-refresh-family");
    render(<RoleGuard role="family">Family content</RoleGuard>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your workspace");
    expect(await screen.findByText("Family content")).toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in and back again", async () => {
    render(<RoleGuard role="family">Family content</RoleGuard>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Ffamily%2Frequests"));
    expect(screen.queryByText("Family content")).toBeNull();
  });

  it("sends the wrong role to 403", async () => {
    setCookie(MOCK_REFRESH_COOKIE, "demo-refresh-agency_admin");
    render(<RoleGuard role="family">Family content</RoleGuard>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/403"));
    expect(screen.queryByText("Family content")).toBeNull();
  });
});
