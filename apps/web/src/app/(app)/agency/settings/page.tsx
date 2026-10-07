import type { Metadata } from "next";
import { AgencySettingsScreen } from "@/features/agencies/screens/AgencySettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <AgencySettingsScreen />;
}
