import type { Metadata } from "next";
import { AgencyRequestsScreen } from "@/features/requests/screens/AgencyRequestsScreen";

export const metadata: Metadata = { title: "Requests" };

export default function Page() {
  return <AgencyRequestsScreen />;
}
