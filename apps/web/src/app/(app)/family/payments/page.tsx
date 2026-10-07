import type { Metadata } from "next";
import { FamilyPaymentsScreen } from "@/features/billing/screens/FamilyPaymentsScreen";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <FamilyPaymentsScreen />;
}
