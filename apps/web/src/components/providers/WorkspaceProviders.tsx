"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ToastProvider } from "@/components/feedback/Toast";
import { createQueryClient } from "@/lib/query-client";

/** Server-data cache and toasts for a signed-in workspace. A new cache per mount, so signing out leaves nothing behind. */
export function WorkspaceProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
