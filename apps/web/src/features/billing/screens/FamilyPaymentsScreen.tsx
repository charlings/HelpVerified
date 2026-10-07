"use client";

import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { isMocking } from "@/config/env";
import { PaymentHistory } from "../components/PaymentHistory";

export function FamilyPaymentsScreen() {
  return (
    <WorkspacePage>
      <PageHeader
        title="Payments"
        description="Placement fees you've paid. Card payments are handled by Paystack; HelpVerified never sees your card details."
      />
      <div className="grid gap-6">
        {isMocking ? (
          <Alert tone="info" title="Demo amounts">
            Amounts shown in demo mode are examples. Real prices will be confirmed before launch.
          </Alert>
        ) : null}
        <PaymentHistory emptyBody="You pay a placement fee when you accept a worker. It will appear here." />
      </div>
    </WorkspacePage>
  );
}
