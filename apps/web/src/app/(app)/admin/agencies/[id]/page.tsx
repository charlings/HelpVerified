import type { Metadata } from "next";
import { AdminAgencyDetailScreen } from "@/features/admin/screens/AdminAgencyDetailScreen";

export const metadata: Metadata = { title: "Agency" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminAgencyDetailScreen agencyId={id} />;
}
