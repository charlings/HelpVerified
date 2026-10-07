import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { api, ApiError } from "./api-client";
import { errorMessages, messageForError } from "./error-messages";

const base = env.NEXT_PUBLIC_API_BASE_URL;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("api client", () => {
  it("returns the JSON body on success", async () => {
    server.use(http.get(`${base}/ping`, () => HttpResponse.json({ ok: true })));
    await expect(api.get("/ping")).resolves.toEqual({ ok: true });
  });

  it("turns the error envelope into a typed ApiError with field errors", async () => {
    server.use(
      http.post(`${base}/contact`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid",
              details: { fields: { email: ["Invalid email"] } },
              request_id: "req-1",
            },
          },
          { status: 422 },
        ),
      ),
    );
    const error = await api.post("/contact", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
      fields: { email: ["Invalid email"] },
      requestId: "req-1",
    });
  });

  it("reports network failures as NETWORK_ERROR", async () => {
    server.use(http.get(`${base}/down`, () => HttpResponse.error()));
    await expect(api.get("/down")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("sends the Idempotency-Key header when given", async () => {
    let received: string | null = null;
    server.use(
      http.post(`${base}/accept`, ({ request }) => {
        received = request.headers.get("Idempotency-Key");
        return HttpResponse.json({});
      }),
    );
    await api.post("/accept", {}, { idempotencyKey: "abc" });
    expect(received).toBe("abc");
  });
});

describe("error messages", () => {
  it("maps known codes and falls back for unknown ones", () => {
    expect(messageForError(new ApiError("RATE_LIMITED", "x", 429))).toBe(errorMessages.RATE_LIMITED);
    expect(messageForError(new ApiError("SOMETHING_NEW", "x", 400))).toBe(errorMessages.INTERNAL_ERROR);
    expect(messageForError(new Error("boom"))).toBe(errorMessages.INTERNAL_ERROR);
  });
});
