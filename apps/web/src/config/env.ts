// Plain validation (no zod): this module is in every page's bundle, so it must stay tiny.

function url(name: string, value: string | undefined, fallback: string): string {
  const candidate = value || fallback;
  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute URL, got "${candidate}"`);
  }
}

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  const candidate = (value || fallback) as T;
  if (!allowed.includes(candidate)) throw new Error(`${name} must be one of ${allowed.join(", ")}`);
  return candidate;
}

// Next.js inlines NEXT_PUBLIC_* only when referenced literally, so each key is read explicitly.
export const env = {
  NEXT_PUBLIC_SITE_URL: url("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000"),
  NEXT_PUBLIC_API_BASE_URL: url(
    "NEXT_PUBLIC_API_BASE_URL",
    process.env.NEXT_PUBLIC_API_BASE_URL,
    "http://localhost:8000/api/v1",
  ),
  NEXT_PUBLIC_API_MOCKING: oneOf(
    "NEXT_PUBLIC_API_MOCKING",
    process.env.NEXT_PUBLIC_API_MOCKING,
    ["enabled", "disabled"] as const,
    "enabled",
  ),
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || undefined,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || undefined,
} as const;

export const isMocking = env.NEXT_PUBLIC_API_MOCKING === "enabled";
