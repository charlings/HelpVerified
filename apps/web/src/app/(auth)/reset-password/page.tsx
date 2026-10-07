import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordScreen } from "@/features/auth/screens/ResetPasswordScreen";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<h1 className="text-4xl">Reset password</h1>}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
