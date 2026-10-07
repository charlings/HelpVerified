import type { Metadata } from "next";
import { AgencyOnboardingScreen } from "@/features/auth/screens/AgencyOnboardingScreen";

export const metadata: Metadata = { title: "Register your agency", robots: { index: false } };

export default function Page() {
  return <AgencyOnboardingScreen />;
}
