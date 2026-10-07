"use client";

import { useShallow } from "zustand/react/shallow";
import { configureAuth } from "@/lib/api-client";
import { authApi } from "./api";
import { loginUrl } from "./redirects";
import { useSessionStore } from "./session";
import type { SessionUser } from "./types";

const store = useSessionStore;

async function refreshAccessToken(): Promise<boolean> {
  try {
    const { access_token } = await authApi.refresh();
    store.getState().setAccessToken(access_token);
    return true;
  } catch {
    return false;
  }
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

configureAuth({
  getToken: () => store.getState().accessToken,
  refresh: refreshAccessToken,
  onAuthFailure: () => {
    store.getState().clear();
    window.location.assign(loginUrl(currentPath(), true));
  },
});

let restoring: Promise<void> | null = null;

/**
 * Restores the session once per page load (refresh cookie → access token → /me).
 * Called by pages that need a session, not on every page, so marketing pages stay light.
 */
export function restoreSession(): Promise<void> {
  const { status } = store.getState();
  if (status === "authenticated" || status === "anonymous") return Promise.resolve();
  restoring ??= (async () => {
    store.getState().setStatus("restoring");
    if (!(await refreshAccessToken())) {
      store.getState().clear();
      return;
    }
    try {
      const user = await authApi.me();
      store.getState().setSession(store.getState().accessToken!, user);
    } catch {
      store.getState().clear();
    }
  })().finally(() => {
    restoring = null;
  });
  return restoring;
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const { access_token, user } = await authApi.login(email, password);
  store.getState().setSession(access_token, user);
  return user;
}

/** Re-reads the user (e.g. after onboarding creates an agency). */
export async function reloadUser(): Promise<void> {
  const token = store.getState().accessToken;
  if (!token) return;
  store.getState().setSession(token, await authApi.me());
}

export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } finally {
    store.getState().clear();
  }
}

export function useSession() {
  return useSessionStore(useShallow((s) => ({ status: s.status, user: s.user })));
}
