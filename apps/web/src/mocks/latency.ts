import { delay } from "msw";

/** Realistic 300–800 ms latency; none in unit tests. */
export function mockLatency() {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  return delay(300 + Math.floor(Math.random() * 500));
}
