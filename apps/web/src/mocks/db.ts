/**
 * Mock database. Starts from the demo seed; mutations are saved to sessionStorage so a reload keeps
 * the demo session and anything created in it (cleared when the tab closes).
 */
import { DEMO_PASSWORD, DEMO_PLACEMENT_FEE_KOBO, seedData } from "./seed";
import type { MockAccessLog, MockAlert, MockUpload } from "./types";

export { DEMO_PASSWORD, DEMO_PLACEMENT_FEE_KOBO };
export type * from "./types";

export type OneTimeToken = {
  token: string;
  user_id: string;
  purpose: "verify_email" | "reset_password";
  expires_at: number;
  used_at: number | null;
};

export type OutboxMessage = { to: string; kind: OneTimeToken["purpose"]; link: string; created_at: number };

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
  created_at: string;
};

function seed() {
  return {
    ...seedData(),
    accessTokens: {} as Record<string, { user_id: string; expires_at: number }>,
    // Stable seeded refresh tokens let tests start signed in (e2e/helpers/session.ts).
    refreshTokens: {
      "demo-refresh-family": { user_id: "u-family", revoked: false },
      "demo-refresh-agency_admin": { user_id: "u-agency", revoked: false },
      "demo-refresh-super_admin": { user_id: "u-admin", revoked: false },
      "demo-refresh-newagency": { user_id: "u-newagency", revoked: false },
      "demo-refresh-kano": { user_id: "u-kano", revoked: false },
      "demo-refresh-bola": { user_id: "u-bola", revoked: false },
      "demo-refresh-newfamily": { user_id: "u-newfamily", revoked: false },
      "demo-refresh-pending": { user_id: "u-pending", revoked: false },
      "demo-refresh-harbour": { user_id: "u-harbour", revoked: false },
    } as Record<string, { user_id: string; revoked: boolean }>,
    oneTimeTokens: [] as OneTimeToken[],
    outbox: [] as OutboxMessage[],
    loginAttempts: {} as Record<string, number[]>,
    /**
     * A new Google user waiting to choose family or agency (the real API keeps this in Redis behind an
     * httpOnly cookie). Demo mode never starts Google sign-in, so only tests set it.
     */
    googlePending: null as { email: string; full_name: string | null } | null,
    contactMessages: [] as ContactMessage[],
    uploads: {} as Record<string, MockUpload>,
    accessLog: [] as MockAccessLog[],
    /** Idempotency-Key → stored response (the real API keeps these in Redis for 24 h). */
    idempotency: {} as Record<string, { status: number; body: unknown }>,
    /** Paystack webhook event IDs already processed (webhook_events UNIQUE(provider, event_id)). */
    webhookEvents: [] as string[],
    /** Payment alerts for admins (ADR 0017). */
    alerts: [] as MockAlert[],
    replacementRequests: [] as {
      id: string;
      placement_id: string;
      requested_by: string;
      reason: string;
      status: "open" | "fulfilled" | "cancelled";
      new_request_id: string;
      created_at: string;
    }[],
  };
}

type Data = ReturnType<typeof seed>;

const STORAGE_KEY = "hv-mock-db-v6"; // bump when the seed shape changes

function load(): Data {
  if (typeof sessionStorage !== "undefined") {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as Data;
    } catch {
      // corrupted or unavailable storage: start from the seed
    }
  }
  return seed();
}

export const db: Data = load();

/**
 * Uploaded file contents, kept in page memory only (never persisted or sent anywhere), so documents
 * can be viewed for the rest of the session. Keyed by Cloudinary public_id.
 */
export const fileBlobs = new Map<string, string>();

export function persist() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage full or blocked: the demo still works for this page view
  }
}

/** Tests: back to the seed. */
export function resetDb() {
  Object.assign(db, seed());
  fileBlobs.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
}
