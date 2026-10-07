import { useSessionStore } from "@/features/auth/session";
import { resetDb } from "@/mocks/db";

/** Fresh mock database, no cookies, empty session — call in beforeEach. */
export function resetAuthState() {
  resetDb();
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
  useSessionStore.setState({ status: "unknown", accessToken: null, user: null });
}

export function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/`;
}
