import type { Metadata } from "next";
import { AdminWorkersScreen } from "@/features/admin/screens/AdminWorkersScreen";

export const metadata: Metadata = { title: "Workers" };

export default function Page() {
  return <AdminWorkersScreen />;
}
