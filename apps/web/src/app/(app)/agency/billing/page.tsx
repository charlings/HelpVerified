import type { Metadata } from "next";
import { Suspense } from "react";
import { AgencyBillingScreen } from "@/features/billing/screens/AgencyBillingScreen";

export const metadata: Metadata = { title: "Billing" };

export default function Page() {
  return (
    <Suspense>
      <AgencyBillingScreen />
    </Suspense>
  );
}
