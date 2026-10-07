import type { Metadata } from "next";
import { AdminWorkerDetailScreen } from "@/features/admin/screens/AdminWorkerDetailScreen";

export const metadata: Metadata = { title: "Worker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminWorkerDetailScreen workerId={id} />;
}
