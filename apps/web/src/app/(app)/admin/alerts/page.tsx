import type { Metadata } from "next";
import { AdminAlertsScreen } from "@/features/admin/screens/AdminAlertsScreen";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return <AdminAlertsScreen />;
}
