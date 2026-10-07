/**
 * Demo-mode stand-in for the API's httpOnly refresh cookie. MSW runs in the page, so it can't set
 * httpOnly cookies; this readable cookie exists only while mocking is enabled.
 */
export const MOCK_REFRESH_COOKIE = "hv_mock_refresh";

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function writeCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  document.cookie =
    value === null
      ? `${name}=; Path=/; SameSite=Lax; Max-Age=0`
      : `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}
