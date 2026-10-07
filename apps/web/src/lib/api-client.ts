import { env, isMocking } from "@/config/env";

export type FieldErrors = Record<string, string[]>;

type ErrorEnvelope = {
  error: { code: string; message: string; details?: { fields?: FieldErrors }; request_id?: string };
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fields?: FieldErrors,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Sent as Idempotency-Key for mutations the client may retry (accept, pay, confirm). */
  idempotencyKey?: string;
  /** Don't attempt a token refresh on 401 (used by the refresh and login calls themselves). */
  skipAuthRetry?: boolean;
};

type AuthHooks = {
  getToken: () => string | null;
  /** Returns true when a new access token was obtained. */
  refresh: () => Promise<boolean>;
  /** Called when the session can't be recovered (refresh failed). */
  onAuthFailure: () => void;
};

// Injected by features/auth so lib stays independent of features.
let auth: AuthHooks | null = null;
let refreshing: Promise<boolean> | null = null;

export function configureAuth(hooks: AuthHooks) {
  auth = hooks;
}

/** One refresh at a time: concurrent 401s share the same refresh attempt. */
function refreshOnce(): Promise<boolean> {
  if (!auth) return Promise.resolve(false);
  refreshing ??= auth.refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Requests wait on this gate. In Phase 1 it starts the mock worker on the first request only,
// so pages that never call the API (most marketing pages) never load MSW.
let startGate: (() => Promise<unknown>) | null = null;
let requestGate: Promise<unknown> | null = null;

export function setRequestGate(start: () => Promise<unknown>) {
  startGate = start;
  requestGate = null;
}

function waitForGate(): Promise<unknown> {
  if (!startGate) return Promise.resolve();
  requestGate ??= startGate();
  return requestGate;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${env.NEXT_PUBLIC_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Demo mode: `?mock_error=CODE` on the page URL forces the mock API to return that error.
 * Optional `mock_error_method=POST` and `mock_error_path=/proposals` limit it to matching requests.
 */
function mockErrorHeader(): Record<string, string> {
  if (!isMocking || typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const code = params.get("mock_error");
  if (!code) return {};
  const method = params.get("mock_error_method");
  const path = params.get("mock_error_path");
  return {
    "x-mock-error": code,
    ...(method ? { "x-mock-error-method": method } : {}),
    ...(path ? { "x-mock-error-path": path } : {}),
  };
}

async function send(method: string, path: string, body: unknown, options: RequestOptions): Promise<Response> {
  const token = auth?.getToken();
  try {
    return await fetch(buildUrl(path, options.query), {
      method,
      signal: options.signal,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        ...mockErrorHeader(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("NETWORK_ERROR", "Network request failed", 0);
  }
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  await waitForGate();

  let response = await send(method, path, body, options);

  // Expired access token: refresh once and retry. If that fails, the session is over.
  if (response.status === 401 && !options.skipAuthRetry && auth?.getToken()) {
    if (await refreshOnce()) {
      response = await send(method, path, body, options);
    } else {
      auth.onAuthFailure();
    }
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text().catch(() => "");
  let payload: unknown = undefined;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = payload as Partial<ErrorEnvelope> | null;
    const error = envelope?.error;
    throw new ApiError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "Unexpected error",
      response.status,
      error?.details?.fields,
      error?.request_id,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options),
};
