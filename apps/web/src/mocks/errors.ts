import { HttpResponse } from "msw";
import type { FieldErrors } from "@/lib/api-client";

/** HTTP status for each API error code (api-contracts.md §2). */
export const statusForCode: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_SUSPENDED: 403,
  AGENCY_NOT_ACTIVE: 403,
  NOT_FOUND: 404,
  WORKER_NOT_VERIFIED: 409,
  WORKER_UNAVAILABLE: 409,
  WORKER_NOT_LISTED: 409,
  DUPLICATE_WORKER: 409,
  ILLEGAL_TRANSITION: 409,
  REQUEST_NOT_OPEN: 409,
  REPLACEMENT_WINDOW_CLOSED: 409,
  EVIDENCE_REQUIRED: 409,
  EMAIL_TAKEN: 409,
  AGENCY_EXISTS: 409,
  ALREADY_PROPOSED: 409,
  HOLD_EXPIRED: 409,
  CHECKOUT_IN_PROGRESS: 409,
  CHECKOUT_ATTEMPTS_EXHAUSTED: 409,
  TOKEN_EXPIRED: 410,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  PAYMENT_PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export function errorResponse(code: string, message: string, fields?: FieldErrors) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        details: fields ? { fields } : {},
        request_id: `mock-${crypto.randomUUID()}`,
      },
    },
    { status: statusForCode[code] ?? 500, headers: code === "RATE_LIMITED" ? { "Retry-After": "30" } : undefined },
  );
}

/**
 * Returns the forced error when the page was opened with ?mock_error=CODE (sent as x-mock-error),
 * optionally limited to one method and/or a path fragment.
 */
export function forcedError(request: Request) {
  const code = request.headers.get("x-mock-error");
  if (!code) return null;
  const method = request.headers.get("x-mock-error-method");
  const path = request.headers.get("x-mock-error-path");
  if (method && method.toUpperCase() !== request.method) return null;
  if (path && !new URL(request.url).pathname.includes(path)) return null;
  return errorResponse(code, `Forced ${code} (mock)`);
}
