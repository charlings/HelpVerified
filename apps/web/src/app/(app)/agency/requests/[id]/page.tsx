import type { Metadata } from "next";
import { AgencyRequestDetailScreen } from "@/features/requests/screens/AgencyRequestDetailScreen";

export const metadata: Metadata = { title: "Request" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgencyRequestDetailScreen requestId={id} />;
}
