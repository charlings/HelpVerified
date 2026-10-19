import { ApiError } from "./api-client";

/** User-facing message for every API error code (api-contracts.md §2). Components never show raw codes. */
export const errorMessages: Record<string, string> = {
  BAD_REQUEST: "Something about that request wasn't right. Please check and try again.",
  UNAUTHENTICATED: "Please sign in to continue.",
  INVALID_CREDENTIALS: "That email and password don't match our records.",
  FORBIDDEN: "You don't have permission to do that.",
  EMAIL_NOT_VERIFIED: "Please verify your email address first. Check your inbox for the link.",
  ACCOUNT_SUSPENDED: "This account has been suspended. Contact us if you think this is a mistake.",
  AGENCY_NOT_ACTIVE: "Your agency needs to be approved and have an active subscription to do this.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  WORKER_NOT_VERIFIED: "This worker can't be listed until all four checks are verified.",
  WORKER_UNAVAILABLE: "This worker has just been placed with another family.",
  WORKER_NOT_LISTED: "This worker isn't listed, so they can't be proposed.",
  DUPLICATE_WORKER: "A worker with this NIN is already on HelpVerified.",
  ILLEGAL_TRANSITION: "That action isn't available any more. Refresh to see the latest status.",
  REQUEST_NOT_OPEN: "This request is no longer open.",
  REPLACEMENT_WINDOW_CLOSED: "The replacement window for this placement has closed.",
  EVIDENCE_REQUIRED: "Upload at least one document before verifying this check.",
  EMAIL_TAKEN: "An account with this email already exists. Try signing in instead.",
  AGENCY_EXISTS: "Your agency has already been registered. We'll email you once it's reviewed.",
  ALREADY_PROPOSED: "You've already proposed this worker for this request.",
  // TODO(content): ADR 0017 section I wording, proposed and awaiting owner approval.
  HOLD_EXPIRED: "Your hold on this worker expired. Accept again to place a new hold.",
  CHECKOUT_IN_PROGRESS: "Your checkout is still being prepared. Please try again in a moment.",
  CHECKOUT_ATTEMPTS_EXHAUSTED:
    "This hold has reached its limit of payment attempts. Cancel it, or let it lapse and accept again.",
  TOKEN_EXPIRED: "This link has expired or has already been used. Request a new one.",
  VALIDATION_ERROR: "Please correct the highlighted fields.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  PAYMENT_PROVIDER_ERROR: "We couldn't reach our payment provider. Please try again shortly.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
  NETWORK_ERROR: "We couldn't reach HelpVerified. Check your connection and try again.",
};

export function messageForError(error: unknown): string {
  if (error instanceof ApiError) return errorMessages[error.code] ?? errorMessages.INTERNAL_ERROR!;
  return errorMessages.INTERNAL_ERROR!;
}
