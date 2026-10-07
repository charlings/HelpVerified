import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authApi } from "@/features/auth/api";
import { ApiError, configureAuth } from "@/lib/api-client";
import { resetAuthState, setCookie } from "@/test/auth-helpers";
import { MOCK_REFRESH_COOKIE, readCookie } from "../cookies";
import { db, DEMO_PASSWORD } from "../db";
import { server } from "../server";

let token: string | null = null;

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  configureAuth({ getToken: () => token, refresh: async () => false, onAuthFailure: () => {} });
});
beforeEach(() => {
  resetAuthState();
  token = null;
});
afterAll(() => server.close());

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "OK",
    (e: ApiError) => e.code,
  );

const signupInput = (email: string, role: "family" | "agency_admin" = "family") => ({
  role,
  full_name: "Test User",
  email,
  password: "password123",
  accept_privacy: true,
});

function latestToken(email: string, kind: "verify_email" | "reset_password") {
  const link = [...db.outbox].reverse().find((m) => m.to === email && m.kind === kind)?.link ?? "";
  return new URL(link, "http://x").searchParams.get("token")!;
}

describe("mock auth rules", () => {
  it("rejects a second signup with the same email", async () => {
    await authApi.signup(signupInput("new@example.com"));
    expect(await codeOf(authApi.signup(signupInput("NEW@example.com")))).toBe("EMAIL_TAKEN");
  });

  it("gives the same error for an unknown email and a wrong password", async () => {
    expect(await codeOf(authApi.login("nobody@example.com", "whatever1"))).toBe("INVALID_CREDENTIALS");
    expect(await codeOf(authApi.login("family@demo.hv", "wrong-password"))).toBe("INVALID_CREDENTIALS");
  });

  it("rate-limits the sixth attempt within a minute", async () => {
    for (let i = 0; i < 5; i++) await codeOf(authApi.login("family@demo.hv", "wrong-password"));
    expect(await codeOf(authApi.login("family@demo.hv", DEMO_PASSWORD))).toBe("RATE_LIMITED");
  });

  it("blocks suspended accounts", async () => {
    expect(await codeOf(authApi.login("suspended@demo.hv", DEMO_PASSWORD))).toBe("ACCOUNT_SUSPENDED");
  });

  it("verification links work once", async () => {
    await authApi.signup(signupInput("verify@example.com"));
    const t = latestToken("verify@example.com", "verify_email");
    await expect(authApi.verifyEmail(t)).resolves.toEqual({ verified: true, role: "family" });
    expect(await codeOf(authApi.verifyEmail(t))).toBe("TOKEN_EXPIRED");
  });

  it("forgot password never reveals whether an account exists", async () => {
    await expect(authApi.forgotPassword("nobody@example.com")).resolves.toBeUndefined();
    await expect(authApi.forgotPassword("family@demo.hv")).resolves.toBeUndefined();
    expect(db.outbox.filter((m) => m.kind === "reset_password").map((m) => m.to)).toEqual(["family@demo.hv"]);
  });

  it("reset links work once and the new password signs in", async () => {
    await authApi.forgotPassword("family@demo.hv");
    const t = latestToken("family@demo.hv", "reset_password");
    await authApi.resetPassword(t, "brand-new-pass");
    expect(await codeOf(authApi.resetPassword(t, "another-pass"))).toBe("TOKEN_EXPIRED");
    await expect(authApi.login("family@demo.hv", "brand-new-pass")).resolves.toMatchObject({
      user: { email: "family@demo.hv" },
    });
  });

  it("rotates refresh tokens and revokes the chain when an old one is reused", async () => {
    await authApi.login("family@demo.hv", DEMO_PASSWORD);
    const first = readCookie(MOCK_REFRESH_COOKIE)!;
    await authApi.refresh();
    const second = readCookie(MOCK_REFRESH_COOKIE)!;
    expect(second).not.toBe(first);

    setCookie(MOCK_REFRESH_COOKIE, first); // replaying a rotated token
    expect(await codeOf(authApi.refresh())).toBe("UNAUTHENTICATED");
    setCookie(MOCK_REFRESH_COOKIE, second); // the chain is now revoked too
    expect(await codeOf(authApi.refresh())).toBe("UNAUTHENTICATED");
  });
});

describe("mock agency onboarding rules", () => {
  const agency = {
    name: "Bright Hands Agency",
    cac_number: "RC 7654321",
    email: "office@brighthands.demo",
    phone: "08051234567",
    address_line: "4 Admiralty Way",
    state: "Lagos" as const,
    lga: "Eti-Osa",
    roles_offered: ["nanny" as const],
  };

  it("requires a verified email", async () => {
    token = (await authApi.login("unverified@demo.hv", DEMO_PASSWORD)).access_token;
    expect(await codeOf(authApi.createAgency(agency))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows one agency per admin and returns it as pending", async () => {
    token = (await authApi.login("newagency@demo.hv", DEMO_PASSWORD)).access_token;
    await expect(authApi.createAgency(agency)).resolves.toMatchObject({ status: "pending" });
    expect(await codeOf(authApi.createAgency({ ...agency, cac_number: "RC 1111111" }))).toBe("AGENCY_EXISTS");
  });

  it("rejects families", async () => {
    token = (await authApi.login("family@demo.hv", DEMO_PASSWORD)).access_token;
    expect(await codeOf(authApi.createAgency(agency))).toBe("FORBIDDEN");
  });
});
