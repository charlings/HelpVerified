import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { api, configureAuth } from "./api-client";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const server = setupServer();
const unauthenticated = () =>
  HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Expired" } }, { status: 401 });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("api client auth", () => {
  it("sends the bearer token", async () => {
    configureAuth({ getToken: () => "tok-1", refresh: async () => false, onAuthFailure: () => {} });
    let header: string | null = null;
    server.use(
      http.get(`${base}/me`, ({ request }) => {
        header = request.headers.get("Authorization");
        return HttpResponse.json({});
      }),
    );
    await api.get("/me");
    expect(header).toBe("Bearer tok-1");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    let token = "old";
    const refresh = vi.fn(async () => {
      token = "new";
      return true;
    });
    configureAuth({ getToken: () => token, refresh, onAuthFailure: () => {} });
    server.use(
      http.get(`${base}/me`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer new" ? HttpResponse.json({ ok: true }) : unauthenticated(),
      ),
    );
    await expect(api.get("/me")).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shares one refresh between concurrent 401s", async () => {
    let token = "old";
    const refresh = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      token = "new";
      return true;
    });
    configureAuth({ getToken: () => token, refresh, onAuthFailure: () => {} });
    server.use(
      http.get(`${base}/a`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer new" ? HttpResponse.json(1) : unauthenticated(),
      ),
    );
    await Promise.all([api.get("/a"), api.get("/a"), api.get("/a")]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reports auth failure when the refresh fails", async () => {
    const onAuthFailure = vi.fn();
    configureAuth({ getToken: () => "old", refresh: async () => false, onAuthFailure });
    server.use(http.get(`${base}/me`, unauthenticated));
    await expect(api.get("/me")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when asked not to (login, refresh calls)", async () => {
    const refresh = vi.fn(async () => true);
    configureAuth({ getToken: () => "old", refresh, onAuthFailure: () => {} });
    server.use(http.post(`${base}/auth/login`, unauthenticated));
    await expect(api.post("/auth/login", {}, { skipAuthRetry: true })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
