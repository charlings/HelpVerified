import type { Metadata } from "next";
import { WorkerPublicProfileScreen } from "@/features/workers/screens/WorkerPublicProfileScreen";

export const metadata: Metadata = { title: "Worker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkerPublicProfileScreen workerId={id} />;
}
