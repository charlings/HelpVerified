"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { formatNaira } from "@/lib/format";
import { paymentsApi, type DemoTransaction } from "../api";

/** Where Paystack sends the payer back: the fee's callback page, or the agency's billing page. */
function callbackUrl(reference: string, kind: DemoTransaction["kind"], cancelled = false) {
  if (kind === "subscription") {
    return cancelled ? routes.agency.billing : `${routes.agency.billing}?reference=${encodeURIComponent(reference)}`;
  }
  const params = new URLSearchParams({ reference });
  if (cancelled) params.set("cancelled", "1");
  return `${routes.family.paymentCallback}?${params.toString()}`;
}

/**
 * Demo mode only. Stands in for Paystack's hosted checkout so the rest of the payment flow
 * (callback page, verification, placement state) runs exactly as it will with Paystack.
 */
export function DemoCheckoutScreen() {
  const router = useRouter();
  const reference = useSearchParams().get("reference") ?? "";
  const tx = useQuery({
    queryKey: ["demo-checkout", reference],
    queryFn: () => paymentsApi.demoTransaction(reference),
    enabled: reference !== "",
  });
  const pay = useMutation({
    mutationFn: () => paymentsApi.demoCharge(reference),
    onSuccess: () => router.push(callbackUrl(reference, tx.data?.kind ?? "placement_fee")),
  });

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10 outline-none"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg sm:p-8">
        <Logo height={28} />
        <h1 className="mt-6 text-3xl">Demo checkout</h1>
        <Alert tone="warning" title="No money moves" className="mt-4">
          This page stands in for Paystack&apos;s secure checkout while HelpVerified runs in demo mode. Don&apos;t enter
          card details anywhere on this site.
        </Alert>

        {!reference ? (
          <p className="mt-6">This checkout link is missing its payment reference.</p>
        ) : tx.isPending ? (
          <LoadingRegion label="Loading payment">
            <Skeleton className="mt-6 h-24" />
          </LoadingRegion>
        ) : tx.isError ? (
          <div className="mt-6">
            {tx.error instanceof ApiError && tx.error.code === "NOT_FOUND" ? (
              <ErrorState error={tx.error} title="We couldn't find this payment" />
            ) : (
              <ErrorState error={tx.error} onRetry={() => tx.refetch()} />
            )}
          </div>
        ) : (
          <>
            <dl className="mt-6 grid gap-3">
              <div className="flex justify-between gap-4">
                <dt>
                  {tx.data.kind === "subscription" ? "Agency subscription, monthly" : "Placement fee"} (demo amount)
                </dt>
                <dd className="font-display text-2xl font-bold text-navy-900">{formatNaira(tx.data.amount_kobo)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-sm">
                <dt>Reference</dt>
                <dd className="font-mono">{tx.data.reference}</dd>
              </div>
              <div className="flex justify-between gap-4 text-sm">
                <dt>Email</dt>
                <dd>{tx.data.email}</dd>
              </div>
            </dl>
            {pay.isError ? (
              <Alert tone="danger" className="mt-6">
                {messageForError(pay.error)}
              </Alert>
            ) : null}
            {tx.data.status === "pending" ? (
              <div className="mt-6 grid gap-2">
                <Button size="lg" shape="app" className="w-full" loading={pay.isPending} onClick={() => pay.mutate()}>
                  Pay {formatNaira(tx.data.amount_kobo)} (demo)
                </Button>
                <Button
                  variant="ghost"
                  shape="app"
                  className="w-full"
                  onClick={() => router.push(callbackUrl(reference, tx.data.kind, true))}
                >
                  Cancel and go back
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                shape="app"
                className="mt-6 w-full"
                onClick={() => router.push(callbackUrl(reference, tx.data.kind))}
              >
                Continue
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
