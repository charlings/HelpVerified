import type { Metadata } from "next";
import { AgencyDashboardScreen } from "@/features/agencies/screens/AgencyDashboardScreen";

export const metadata: Metadata = { title: "Agency dashboard" };

export default function Page() {
  return <AgencyDashboardScreen />;
}
