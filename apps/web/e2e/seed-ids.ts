import { createHash } from "node:crypto";

/**
 * The real API's demo seed (apps/api/app/scripts/seed.py) stores each mock ID ("w-amaka") as a UUIDv5
 * in this namespace, so the e2e tests can build the same URLs against either backend.
 * apps/api/tests/integration/test_seed.py pins two values; keep the namespace identical.
 */
const SEED_NAMESPACE = "5f0c3a52-8d0e-4b8e-9a51-6a1e2f7d4c10";

function uuid5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const bytes = createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(name, "utf8")]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function seedId(mockId: string): string {
  return uuid5(mockId, SEED_NAMESPACE);
}
