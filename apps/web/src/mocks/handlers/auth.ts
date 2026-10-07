import { http, HttpResponse } from "msw";
import { env } from "@/config/env";
import { routes } from "@/config/routes";
import { forgotPasswordSchema, loginSchema, signupSchema } from "@/features/auth";
import type { FieldErrors } from "@/lib/api-client";
import { MOCK_REFRESH_COOKIE, readCookie, writeCookie } from "../cookies";
import { db, persist, type MockUser, type OneTimeToken } from "../db";
import { errorResponse, forcedError } from "../errors";
import { mockLatency } from "../latency";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const ACCESS_TTL_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60 * 1000;
const TOKEN_TTL_MS = { verify_email: 24 * 60 * 60 * 1000, reset_password: 60 * 60 * 1000 } as const;

export function userOut(user: MockUser) {
  const agency = db.agencies.find((a) => a.admin_user_id === user.id);
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    email_verified: user.email_verified_at !== null,
    agency: agency ? { id: agency.id, name: agency.name, status: agency.status } : null,
  };
}

export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of issues) (fields[String(issue.path[0] ?? "body")] ??= []).push(issue.message);
  return fields;
}

/** The user behind the request's bearer token, or null. */
export function authenticate(request: Request): MockUser | null {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  const entry = token ? db.accessTokens[token] : undefined;
  if (!entry || entry.expires_at < Date.now()) return null;
  const user = db.users.find((u) => u.id === entry.user_id);
  return user && user.status === "active" ? user : null;
}

function issueAccessToken(userId: string): string {
  const token = `mock-access-${crypto.randomUUID()}`;
  db.accessTokens[token] = { user_id: userId, expires_at: Date.now() + ACCESS_TTL_MS };
  return token;
}

function issueRefreshToken(userId: string) {
  const token = `mock-refresh-${crypto.randomUUID()}`;
  db.refreshTokens[token] = { user_id: userId, revoked: false };
  writeCookie(MOCK_REFRESH_COOKIE, token);
}

function issueOneTimeToken(user: MockUser, purpose: OneTimeToken["purpose"]) {
  const token = crypto.randomUUID();
  db.oneTimeTokens.push({
    token,
    user_id: user.id,
    purpose,
    expires_at: Date.now() + TOKEN_TTL_MS[purpose],
    used_at: null,
  });
  const path = purpose === "verify_email" ? routes.auth.verifyEmail : routes.auth.reset;
  db.outbox.push({ to: user.email, kind: purpose, link: `${path}?token=${token}`, created_at: Date.now() });
}

function consumeToken(token: unknown, purpose: OneTimeToken["purpose"]): MockUser | null {
  const entry = db.oneTimeTokens.find((t) => t.token === token && t.purpose === purpose);
  if (!entry || entry.used_at !== null || entry.expires_at < Date.now()) return null;
  entry.used_at = Date.now();
  return db.users.find((u) => u.id === entry.user_id) ?? null;
}

function findByEmail(email: string) {
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

async function body(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export const authHandlers = [
  http.post(`${base}/auth/signup`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const raw = (await body(request)) as Record<string, unknown> | null;
    const parsed = signupSchema.safeParse({ ...raw, accept_privacy: Boolean(raw?.privacy_notice_version) });
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid signup.", fieldErrors(parsed.error.issues));
    if (findByEmail(parsed.data.email)) return errorResponse("EMAIL_TAKEN", "Email already registered.");

    const created: MockUser = {
      id: `u-${crypto.randomUUID()}`,
      email: parsed.data.email,
      password: parsed.data.password,
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      status: "active",
      email_verified_at: null,
      privacy_notice_version: String(raw?.privacy_notice_version),
    };
    db.users.push(created);
    issueOneTimeToken(created, "verify_email");
    persist();
    return HttpResponse.json({ user: userOut(created) }, { status: 201 });
  }),

  http.post(`${base}/auth/login`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const parsed = loginSchema.safeParse(await body(request));
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid login.", fieldErrors(parsed.error.issues));

    const key = parsed.data.email.toLowerCase();
    const recent = (db.loginAttempts[key] ?? []).filter((t) => t > Date.now() - LOGIN_WINDOW_MS);
    if (recent.length >= LOGIN_LIMIT) return errorResponse("RATE_LIMITED", "Too many attempts.");
    db.loginAttempts[key] = [...recent, Date.now()];

    const user = findByEmail(parsed.data.email);
    // Same response whether the email exists or not.
    if (!user || user.password !== parsed.data.password) {
      persist();
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password.");
    }
    if (user.status === "suspended") return errorResponse("ACCOUNT_SUSPENDED", "Account suspended.");

    db.loginAttempts[key] = [];
    issueRefreshToken(user.id);
    const access_token = issueAccessToken(user.id);
    persist();
    return HttpResponse.json({ access_token, user: userOut(user) });
  }),

  http.post(`${base}/auth/refresh`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const current = readCookie(MOCK_REFRESH_COOKIE);
    const entry = current ? db.refreshTokens[current] : undefined;
    if (!current || !entry) return errorResponse("UNAUTHENTICATED", "No session.");
    if (entry.revoked) {
      // Reuse of a rotated token: revoke the whole chain for this user and force sign-in.
      for (const t of Object.values(db.refreshTokens)) if (t.user_id === entry.user_id) t.revoked = true;
      writeCookie(MOCK_REFRESH_COOKIE, null);
      persist();
      return errorResponse("UNAUTHENTICATED", "Session revoked.");
    }
    const user = db.users.find((u) => u.id === entry.user_id);
    if (!user || user.status !== "active") return errorResponse("UNAUTHENTICATED", "No session.");
    entry.revoked = true;
    issueRefreshToken(user.id);
    const access_token = issueAccessToken(user.id);
    persist();
    return HttpResponse.json({ access_token });
  }),

  http.post(`${base}/auth/logout`, async () => {
    const current = readCookie(MOCK_REFRESH_COOKIE);
    const entry = current ? db.refreshTokens[current] : undefined;
    if (entry) entry.revoked = true;
    writeCookie(MOCK_REFRESH_COOKIE, null);
    persist();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${base}/me`, async ({ request }) => {
    const forced = forcedError(request);
    if (forced) return forced;
    const user = authenticate(request);
    return user ? HttpResponse.json(userOut(user)) : errorResponse("UNAUTHENTICATED", "Not signed in.");
  }),

  http.post(`${base}/auth/verify-email`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const raw = (await body(request)) as { token?: unknown } | null;
    const user = consumeToken(raw?.token, "verify_email");
    if (!user) return errorResponse("TOKEN_EXPIRED", "Link expired or used.");
    user.email_verified_at = new Date().toISOString();
    persist();
    return HttpResponse.json({ verified: true, role: user.role });
  }),

  http.post(`${base}/auth/resend-verification`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const parsed = forgotPasswordSchema.safeParse(await body(request));
    const user = parsed.success ? findByEmail(parsed.data.email) : undefined;
    if (user && !user.email_verified_at) {
      issueOneTimeToken(user, "verify_email");
      persist();
    }
    return new HttpResponse(null, { status: 202 });
  }),

  http.post(`${base}/auth/forgot-password`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const parsed = forgotPasswordSchema.safeParse(await body(request));
    const user = parsed.success ? findByEmail(parsed.data.email) : undefined;
    if (user) {
      issueOneTimeToken(user, "reset_password");
      persist();
    }
    // Always 202 so the response doesn't reveal whether the email has an account.
    return new HttpResponse(null, { status: 202 });
  }),

  http.post(`${base}/auth/reset-password`, async ({ request }) => {
    await mockLatency();
    const forced = forcedError(request);
    if (forced) return forced;
    const raw = (await body(request)) as { token?: unknown; password?: unknown } | null;
    if (typeof raw?.password !== "string" || raw.password.length < 8) {
      return errorResponse("VALIDATION_ERROR", "Invalid password.", { password: ["Use at least 8 characters."] });
    }
    const user = consumeToken(raw.token, "reset_password");
    if (!user) return errorResponse("TOKEN_EXPIRED", "Link expired or used.");
    user.password = raw.password;
    for (const t of Object.values(db.refreshTokens)) if (t.user_id === user.id) t.revoked = true;
    persist();
    return new HttpResponse(null, { status: 204 });
  }),

  // Demo mode only: lets the "check your email" screens open the link that would have been emailed.
  http.get(`${base}/__mock/outbox`, ({ request }) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.toLowerCase();
    const kind = url.searchParams.get("kind");
    const latest = [...db.outbox].reverse().find((m) => m.to.toLowerCase() === email && m.kind === kind);
    return HttpResponse.json({ link: latest?.link ?? null });
  }),
];
