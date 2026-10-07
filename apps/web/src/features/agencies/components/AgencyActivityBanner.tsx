import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { routes } from "@/config/routes";
import type { AgencyDashboard } from "../api";

/** Explains why listing and proposing are switched off, when they are. */
export function AgencyActivityBanner({
  dashboard,
}: {
  dashboard: Pick<AgencyDashboard, "active" | "agency" | "subscription">;
}) {
  if (dashboard.active) return null;
  if (dashboard.agency.status === "pending") {
    return (
      <Alert tone="warning" title="Your agency is waiting for approval">
        You can add workers and complete their checks now. Listing workers and proposing them to families opens once our
        team approves your agency and your subscription is active.
      </Alert>
    );
  }
  if (dashboard.agency.status !== "approved") {
    return (
      <Alert tone="danger" title="Your agency can't list or propose workers">
        Your agency is {dashboard.agency.status}.
        {dashboard.agency.status_reason ? ` Reason: ${dashboard.agency.status_reason}` : ""}{" "}
        <Link href={routes.contact} className="font-semibold underline">
          Contact us
        </Link>{" "}
        to resolve this. Placements already running continue as normal.
      </Alert>
    );
  }
  return (
    <Alert tone="warning" title="Your subscription isn't active">
      Listing and proposing need an active subscription.{" "}
      <Link href={routes.agency.billing} className="font-semibold underline">
        View billing
      </Link>
    </Alert>
  );
}
