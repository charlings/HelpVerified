"use client";

import { create } from "zustand";
import type { Role } from "@/config/routes";
import type { SessionUser } from "./types";

export type SessionStatus = "unknown" | "restoring" | "authenticated" | "anonymous";

type SessionState = {
  status: SessionStatus;
  /** In memory only — never written to localStorage or a readable cookie. */
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (accessToken: string, user: SessionUser) => void;
  setAccessToken: (accessToken: string) => void;
  setStatus: (status: SessionStatus) => void;
  clear: () => void;
};

/**
 * Non-sensitive role hint for middleware.ts fast redirects. The API is the real authority;
 * RoleGuard corrects any mismatch once the session is restored.
 */
function writeRoleCookie(role: Role | null) {
  if (typeof document === "undefined") return;
  document.cookie = role
    ? `hv_role=${role}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`
    : "hv_role=; Path=/; SameSite=Lax; Max-Age=0";
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "unknown",
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => {
    writeRoleCookie(user.role);
    set({ status: "authenticated", accessToken, user });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  setStatus: (status) => set({ status }),
  clear: () => {
    writeRoleCookie(null);
    set({ status: "anonymous", accessToken: null, user: null });
  },
}));
