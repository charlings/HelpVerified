"use client";

import { DemoModePill } from "@/components/feedback/DemoModePill";
import { isMocking } from "@/config/env";
import { setRequestGate } from "@/lib/api-client";

// Phase 1: the mock API is loaded on the first API request, not on page load, so pages that never call
// the API stay light. The import is dynamic so MSW is never in the main bundle.
if (isMocking && typeof window !== "undefined") {
  setRequestGate(() =>
    import("@/mocks/browser").then(({ worker }) => worker.start({ onUnhandledFrame: "bypass", quiet: true })),
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {isMocking ? <DemoModePill /> : null}
    </>
  );
}
