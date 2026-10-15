"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { isMocking } from "@/config/env";
import { messageForError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import { billingApi, billingKeys } from "../api";
import { PaymentHistory } from "../components/PaymentHistory";
import { subscriptionStatus } from "../status";

/** Paystack reports a payment a few seconds after the redirect; check again this many times. */
const MAX_PAYMENT_CHECKS = 10;

/** After Paystack's checkout: Paystack sends the agency back here with `?reference=`. */
function ReturnedPayment({ reference }: { reference: string }) {
  const client = useQueryClient();
  const check = useQuery({
    queryKey: billingKeys.payment(reference),
    queryFn: () => billingApi.verifyPayment(reference),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" && query.state.dataUpdateCount < MAX_PAYMENT_CHECKS ? 3000 : false,
  });
  const status = check.data?.status;

  useEffect(() => {
    // The subscription, payment history and the agency's activity all change once the payment lands.
    if (status === "success") void client.invalidateQueries();
  }, [status, client]);

  if (check.isPending) {
    return (
      <Alert tone="info" title="Checking your payment">
        One moment while we confirm your payment with Paystack.
      </Alert>
    );
  }
  if (check.isError) return <Alert tone="danger">{messageForError(check.error)}</Alert>;
  if (status === "success") {
    return (
      <Alert tone="success" title="Payment received">
        Thank you. Your subscription is active, so you can list workers and propose them to families.
      </Alert>
    );
  }
  if (status === "pending") {
    return (
      <Alert tone="info" title="Confirming your payment">
        Paystack hasn&apos;t confirmed this payment yet. This page checks again on its own.
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title="The payment didn't go through">
      Your subscription hasn&apos;t started. You can try again below.
    </Alert>
  );
}

export function AgencyBillingScreen() {
  const [manageNotice, setManageNotice] = useState(false);
  const router = useRouter();
  const reference = useSearchParams().get("reference");
  const subscription = useQuery({ queryKey: billingKeys.subscription, queryFn: billingApi.subscription });
  const subscribe = useMutation({
    mutationFn: billingApi.startSubscription,
    onSuccess: ({ authorization_url: url }) => {
      // Paystack's checkout is another site; the demo checkout is in-app.
      if (url.startsWith("/")) router.push(url);
      else window.location.assign(url);
    },
  });
  const active = subscription.data?.status === "active";

  return (
    <WorkspacePage>
      <PageHeader title="Billing" description="Your subscription and payment history." />
      <div className="grid gap-6">
        {isMocking ? (
          <Alert tone="info" title="Demo amounts">
            Amounts shown in demo mode are examples. Real prices will be confirmed before launch.
          </Alert>
        ) : null}
        {reference ? <ReturnedPayment reference={reference} /> : null}

        <section
          aria-labelledby="subscription-heading"
          className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 id="subscription-heading" className="text-xl">
            Subscription
          </h2>
          {subscription.isPending ? (
            <LoadingRegion label="Loading subscription">
              <Skeleton className="mt-4 h-16" />
            </LoadingRegion>
          ) : subscription.isError ? (
            <div className="mt-4">
              <ErrorState error={subscription.error} onRetry={() => subscription.refetch()} />
            </div>
          ) : subscription.data === null ? (
            <p className="mt-3">
              You don&apos;t have a subscription yet. You&apos;ll need one, and an approved agency, to list workers and
              propose them to families.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-navy-900">{subscription.data.plan_name}</p>
                <p className="mt-1 text-sm">
                  {subscriptionStatus[subscription.data.status].description}
                  {subscription.data.current_period_end ? (
                    <>
                      {" "}
                      · {subscription.data.status === "active" ? "Next renewal" : "Period ends"}{" "}
                      {formatDate(subscription.data.current_period_end.slice(0, 10))}
                    </>
                  ) : null}
                </p>
              </div>
              <Badge tone={subscriptionStatus[subscription.data.status].tone}>
                {subscriptionStatus[subscription.data.status].label}
              </Badge>
            </div>
          )}
          {subscription.isSuccess ? (
            <div className="mt-5">
              {active ? (
                <>
                  <Button
                    variant="secondary"
                    shape="app"
                    onClick={() => setManageNotice(true)}
                    aria-describedby="manage-notice"
                  >
                    Manage subscription
                  </Button>
                  <p id="manage-notice" role="status" className="mt-2 text-sm">
                    {manageNotice
                      ? "Changing your card or cancelling isn't available in the app yet. Contact us and we'll help."
                      : null}
                  </p>
                </>
              ) : (
                <>
                  <Button shape="app" loading={subscribe.isPending} onClick={() => subscribe.mutate()}>
                    Subscribe
                  </Button>
                  <p className="mt-2 text-sm">You&apos;ll pay on Paystack&apos;s secure checkout. It renews monthly.</p>
                  {subscribe.isError ? (
                    <Alert tone="danger" className="mt-3">
                      {messageForError(subscribe.error)}
                    </Alert>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>

        <section aria-labelledby="payments-heading">
          <h2 id="payments-heading" className="mb-3 text-xl">
            Payment history
          </h2>
          <PaymentHistory />
        </section>
      </div>
    </WorkspacePage>
  );
}
