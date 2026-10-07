import type { Metadata } from "next";
import { AdminAuditLogScreen } from "@/features/admin/screens/AdminAuditLogScreen";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AdminAuditLogScreen />;
}
