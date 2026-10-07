import type { Metadata } from "next";
import { PlacementsListScreen } from "@/features/placements/screens/PlacementsListScreen";

export const metadata: Metadata = { title: "Placements" };

export default function Page() {
  return <PlacementsListScreen viewer="family" />;
}
