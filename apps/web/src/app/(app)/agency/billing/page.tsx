import type { Metadata } from "next";
import { AgencyBillingScreen } from "@/features/billing/screens/AgencyBillingScreen";

export const metadata: Metadata = { title: "Billing" };

export default function Page() {
  return <AgencyBillingScreen />;
}
