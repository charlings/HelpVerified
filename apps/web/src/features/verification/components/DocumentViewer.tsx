"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/feedback/Skeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Dialog } from "@/components/ui/Dialog";
import { verificationApi } from "../api";
import type { VerificationDocument } from "../types";

type DocumentViewerProps = {
  document: VerificationDocument | null;
  title: string;
  onClose: () => void;
};

/**
 * Shows a document in-app. The short-lived URL is fetched only when opened (each fetch is logged by the API)
 * and never cached, stored or put in the address bar.
 */
export function DocumentViewer({ document, title, onClose }: DocumentViewerProps) {
  const query = useQuery({
    queryKey: ["document-url", document?.id],
    queryFn: () => verificationApi.documentUrl(document!.id),
    enabled: document !== null,
    gcTime: 0,
    staleTime: 0,
  });

  const url = query.data?.url;
  const isImage = url?.startsWith("data:image") || (document && document.format !== "pdf");

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()} title={title} size="lg">
      {query.isPending ? <Skeleton className="h-96" /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      {url ? (
        isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed/blob URL, not an optimisable asset
          <img src={url} alt={title} className="max-h-[70dvh] w-full rounded-md object-contain" />
        ) : (
          <iframe src={url} title={title} className="h-[70dvh] w-full rounded-md border border-border" />
        )
      ) : null}
    </Dialog>
  );
}
