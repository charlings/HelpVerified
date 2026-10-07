import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/features/auth/screens/ForgotPasswordScreen";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function Page() {
  return <ForgotPasswordScreen />;
}
