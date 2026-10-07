import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentCallbackScreen } from "@/features/payments/screens/PaymentCallbackScreen";

export const metadata: Metadata = { title: "Payment" };

export default function Page() {
  return (
    <Suspense>
      <PaymentCallbackScreen />
    </Suspense>
  );
}
