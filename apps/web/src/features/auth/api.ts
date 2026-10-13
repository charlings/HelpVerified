import { api } from "@/lib/api-client";
import { PRIVACY_NOTICE_VERSION, type AgencyPayload, type GoogleSignupInput, type SignupInput } from "./schemas";
import type {
  AgencySummary,
  GooglePendingResponse,
  LoginResponse,
  RefreshResponse,
  SessionUser,
  SignupResponse,
  VerifyEmailResponse,
} from "./types";

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }, { skipAuthRetry: true }),

  signup: (input: SignupInput) =>
    api.post<SignupResponse>(
      "/auth/signup",
      {
        email: input.email,
        password: input.password,
        full_name: input.full_name,
        role: input.role,
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
      },
      { skipAuthRetry: true },
    ),

  refresh: () => api.post<RefreshResponse>("/auth/refresh", undefined, { skipAuthRetry: true }),
  logout: () => api.post<void>("/auth/logout", undefined, { skipAuthRetry: true }),
  me: () => api.get<SessionUser>("/me", { skipAuthRetry: true }),

  verifyEmail: (token: string) =>
    api.post<VerifyEmailResponse>("/auth/verify-email", { token }, { skipAuthRetry: true }),
  resendVerification: (email: string) =>
    api.post<void>("/auth/resend-verification", { email }, { skipAuthRetry: true }),
  forgotPassword: (email: string) => api.post<void>("/auth/forgot-password", { email }, { skipAuthRetry: true }),
  resetPassword: (token: string, password: string) =>
    api.post<void>("/auth/reset-password", { token, password }, { skipAuthRetry: true }),

  /** A new Google user's details (from the API's httpOnly pending cookie); 410 TOKEN_EXPIRED if gone. */
  googlePending: () => api.get<GooglePendingResponse>("/auth/google/pending", { skipAuthRetry: true }),
  googleComplete: (input: GoogleSignupInput) =>
    api.post<LoginResponse>(
      "/auth/google/complete",
      { full_name: input.full_name, role: input.role, privacy_notice_version: PRIVACY_NOTICE_VERSION },
      { skipAuthRetry: true },
    ),

  createAgency: (payload: AgencyPayload) => api.post<AgencySummary>("/agencies", payload),

  /** Demo mode only: the link the mock "would have emailed". */
  demoInbox: (email: string, kind: "verify_email" | "reset_password") =>
    api.get<{ link: string | null }>("/__mock/outbox", { query: { email, kind }, skipAuthRetry: true }),
};
