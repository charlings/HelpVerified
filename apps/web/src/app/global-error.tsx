"use client";

// Rendered when the root layout itself fails, so it cannot rely on globals.css or fonts.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", maxWidth: "40rem", margin: "0 auto" }}
      >
        <h1>Something went wrong</h1>
        <p>HelpVerified couldn&apos;t load. Please try again.</p>
        <button type="button" onClick={reset} style={{ marginTop: "1rem", padding: "0.75rem 1.25rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
