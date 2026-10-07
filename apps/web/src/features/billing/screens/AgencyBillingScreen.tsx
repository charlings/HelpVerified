"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { isMocking } from "@/config/env";
import { formatDate } from "@/lib/format";
import { billingApi, billingKeys } from "../api";
import { PaymentHistory } from "../components/PaymentHistory";
import { subscriptionStatus } from "../status";

export function AgencyBillingScreen() {
  const [manageNotice, setManageNotice] = useState(false);
  const subscription = useQuery({ queryKey: billingKeys.subscription, queryFn: billingApi.subscription });

  return (
    <WorkspacePage>
      <PageHeader title="Billing" description="Your subscription and payment history." />
      <div className="grid gap-6">
        {isMocking ? (
          <Alert tone="info" title="Demo amounts">
            Amounts shown in demo mode are examples. Real prices will be confirmed before launch.
          </Alert>
        ) : null}

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
                  {subscriptionStatus[subscription.data.status].description} ·{" "}
                  {subscription.data.status === "active" ? "Next renewal" : "Period ends"}{" "}
                  {formatDate(subscription.data.current_period_end.slice(0, 10))}
                </p>
              </div>
              <Badge tone={subscriptionStatus[subscription.data.status].tone}>
                {subscriptionStatus[subscription.data.status].label}
              </Badge>
            </div>
          )}
          <div className="mt-5">
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
                ? "Changing your subscription opens Paystack's secure checkout. It becomes available when payments go live."
                : null}
            </p>
          </div>
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
