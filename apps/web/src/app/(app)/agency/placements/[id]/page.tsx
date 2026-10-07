import type { Metadata } from "next";
import { PlacementDetailScreen } from "@/features/placements/screens/PlacementDetailScreen";

export const metadata: Metadata = { title: "Placement" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlacementDetailScreen placementId={id} viewer="agency_admin" />;
}
