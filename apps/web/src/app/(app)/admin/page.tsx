import type { Metadata } from "next";
import { AdminOverviewScreen } from "@/features/admin/screens/AdminOverviewScreen";

export const metadata: Metadata = { title: "Admin overview" };

export default function Page() {
  return <AdminOverviewScreen />;
}
