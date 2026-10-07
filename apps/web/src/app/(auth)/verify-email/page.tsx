import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailScreen } from "@/features/auth/screens/VerifyEmailScreen";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<h1 className="text-4xl">Verify your email</h1>}>
      <VerifyEmailScreen />
    </Suspense>
  );
}
