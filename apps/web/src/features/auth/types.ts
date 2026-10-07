import type { Role } from "@/config/routes";

export type AgencySummary = { id: string; name: string; status: "pending" | "approved" | "suspended" | "rejected" };

/** `GET /me` and the `user` returned by login/signup. */
export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  email_verified: boolean;
  agency: AgencySummary | null;
};

export type SelfServiceRole = Extract<Role, "family" | "agency_admin">;

export type LoginResponse = { access_token: string; user: SessionUser };
export type RefreshResponse = { access_token: string };
export type SignupResponse = { user: SessionUser };
export type VerifyEmailResponse = { verified: true; role: Role };
