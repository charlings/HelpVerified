import type { Metadata } from "next";
import { FamilyRequestsScreen } from "@/features/requests/screens/FamilyRequestsScreen";

export const metadata: Metadata = { title: "Requests" };

export default function Page() {
  return <FamilyRequestsScreen />;
}
