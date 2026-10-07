"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-(--container-marketing) px-6 py-24">
      <h1 className="text-4xl">Something went wrong</h1>
      <p className="mt-4 max-w-(--container-prose)">
        An unexpected error stopped this page from loading. Try again, and if it keeps happening, contact us.
      </p>
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
