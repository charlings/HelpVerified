"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion } from "@/components/feedback/Skeleton";
import { WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { isMocking } from "@/config/env";
import { routes } from "@/config/routes";
import { formatNaira } from "@/lib/format";
import { paymentsApi } from "../api";

/** Where Paystack (or the demo checkout) returns the family. The API is asked; the URL is never trusted. */
export function PaymentCallbackScreen() {
  const params = useSearchParams();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const cancelled = params.get("cancelled") === "1";
  const query = useQuery({
    queryKey: ["payment-verify", reference],
    queryFn: () => paymentsApi.verify(reference),
    enabled: reference !== "",
    staleTime: 0,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (query.data) headingRef.current?.focus();
  }, [query.data]);

  const placementLink = (id: string, label: string) => (
    <Link href={routes.family.placement(id)} className={buttonVariants({ shape: "app" })}>
      {label}
    </Link>
  );

  let body: React.ReactNode;
  let title = "Payment";
  if (!reference) {
    title = "We couldn't find your payment";
    body = <p>The link is missing its payment reference. Open the placement to try again.</p>;
  } else if (query.isPending) {
    title = "Checking your payment…";
    body = <LoadingRegion label="Checking your payment">{null}</LoadingRegion>;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  } else {
    const p = query.data;
    if (p.status === "success") {
      title = "Payment received";
      body = (
        <div className="grid gap-4">
          <p className="flex items-center gap-2 text-lg text-navy-900">
            <CircleCheck aria-hidden="true" className="size-6 text-success-600" />
            {formatNaira(p.amount_kobo)} paid. The trial has started.
          </p>
          {p.placement_id ? <div>{placementLink(p.placement_id, "Go to your placement")}</div> : null}
        </div>
      );
    } else if (p.status === "refunded") {
      title = "Your payment will be refunded";
      body = (
        <Alert tone="warning">
          The hold on this worker ended before your payment arrived, so the placement couldn&apos;t go ahead. Your
          payment will be refunded. Your request is open again for other proposals.
        </Alert>
      );
    } else if (p.status === "failed") {
      title = "Payment didn't go through";
      body = (
        <div className="grid gap-4">
          <Alert tone="danger">Your payment failed and you haven&apos;t been charged.</Alert>
          {p.placement_id ? <div>{placementLink(p.placement_id, "Back to the placement")}</div> : null}
        </div>
      );
    } else {
      title = cancelled ? "Payment not completed" : "We haven't received your payment yet";
      body = (
        <div className="grid gap-4">
          <p>
            {cancelled
              ? "You left the checkout before paying. The worker is still held for you until the hold ends."
              : "It can take a moment to come through. Check again shortly."}
          </p>
          <div className="flex flex-wrap gap-2">
            {isMocking ? (
              <Link
                href={`${routes.demoCheckout}?reference=${encodeURIComponent(reference)}`}
                className={buttonVariants({ shape: "app" })}
              >
                Return to checkout
              </Link>
            ) : null}
            <Button variant="secondary" shape="app" onClick={() => query.refetch()}>
              Check again
            </Button>
            {p.placement_id ? (
              <Link
                href={routes.family.placement(p.placement_id)}
                className={buttonVariants({ variant: "ghost", shape: "app" })}
              >
                View placement
              </Link>
            ) : null}
          </div>
        </div>
      );
    }
  }

  return (
    <WorkspacePage>
      <div className="mb-6">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl outline-none md:text-4xl">
          {title}
        </h1>
      </div>
      <div className="max-w-2xl">{body}</div>
    </WorkspacePage>
  );
}
