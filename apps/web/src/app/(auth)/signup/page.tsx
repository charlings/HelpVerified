import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupScreen } from "@/features/auth/screens/SignupScreen";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<h1 className="text-4xl">Create an account</h1>}>
      <SignupScreen />
    </Suspense>
  );
}
