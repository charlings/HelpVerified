import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WorkspaceProviders } from "@/components/providers/WorkspaceProviders";
import { isMocking } from "@/config/env";
import { DemoCheckoutScreen } from "@/features/payments/screens/DemoCheckoutScreen";

export const metadata: Metadata = { title: "Demo checkout", robots: { index: false, follow: false } };

/** Demo mode only: stands in for Paystack's hosted checkout. Doesn't exist when mocking is off. */
export default function Page() {
  if (!isMocking) notFound();
  return (
    <WorkspaceProviders>
      <Suspense>
        <DemoCheckoutScreen />
      </Suspense>
    </WorkspaceProviders>
  );
}
