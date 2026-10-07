import type { Metadata } from "next";
import { WorkerDetailScreen } from "@/features/workers/screens/WorkerDetailScreen";

export const metadata: Metadata = { title: "Worker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkerDetailScreen workerId={id} />;
}
