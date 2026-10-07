import type { Metadata } from "next";
import { FamilyDashboardScreen } from "@/features/families/screens/FamilyDashboardScreen";

export const metadata: Metadata = { title: "Family dashboard" };

export default function Page() {
  return <FamilyDashboardScreen />;
}
