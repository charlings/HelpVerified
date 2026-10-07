import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/features/auth/screens/LoginScreen";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<h1 className="text-4xl">Sign in</h1>}>
      <LoginScreen />
    </Suspense>
  );
}
