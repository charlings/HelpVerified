import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleSignupScreen } from "@/features/auth/screens/GoogleSignupScreen";

export const metadata: Metadata = { title: "Finish signing up", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<h1 className="text-4xl">Finish signing up</h1>}>
      <GoogleSignupScreen />
    </Suspense>
  );
}
