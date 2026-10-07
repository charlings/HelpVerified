import type { Metadata } from "next";
import { FamilySettingsScreen } from "@/features/families/screens/FamilySettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <FamilySettingsScreen />;
}
