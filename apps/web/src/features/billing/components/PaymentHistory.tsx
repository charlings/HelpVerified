"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { Pagination } from "@/components/data/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingRegion, Skeleton } from "@/components/feedback/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatNaira } from "@/lib/format";
import { billingApi, billingKeys, type Payment } from "../api";
import { paymentStatus } from "../status";

const columns: Column<Payment>[] = [
  { key: "date", header: "Date", primary: true, cell: (p) => formatDate((p.paid_at ?? p.created_at).slice(0, 10)) },
  { key: "description", header: "Description", cell: (p) => p.description },
  { key: "amount", header: "Amount", cell: (p) => formatNaira(p.amount_kobo) },
  {
    key: "status",
    header: "Status",
    cell: (p) => <Badge tone={paymentStatus[p.status].tone}>{paymentStatus[p.status].label}</Badge>,
  },
  { key: "reference", header: "Reference", cell: (p) => <span className="font-mono text-xs">{p.reference}</span> },
];

/** The signed-in user's payments (the API scopes them), paginated, with loading, empty and error states. */
export function PaymentHistory({ emptyBody }: { emptyBody?: string }) {
  const [page, setPage] = useState(1);
  const payments = useQuery({
    queryKey: billingKeys.payments(page),
    queryFn: () => billingApi.payments(page),
    placeholderData: (previous) => previous,
  });

  if (payments.isPending) {
    return (
      <LoadingRegion label="Loading payments">
        <Skeleton className="h-40" />
      </LoadingRegion>
    );
  }
  if (payments.isError) return <ErrorState error={payments.error} onRetry={() => payments.refetch()} />;
  if (payments.data.total === 0) return <EmptyState icon={Receipt} title="No payments yet" body={emptyBody} />;
  return (
    <>
      <DataTable caption="Payment history" columns={columns} rows={payments.data.items} rowKey={(p) => p.id} />
      <Pagination label="Payments" page={page} pageSize={20} total={payments.data.total} onPageChange={setPage} />
    </>
  );
}
