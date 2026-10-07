import type { Metadata } from "next";
import { Suspense } from "react";
import { NewRequestScreen } from "@/features/requests/screens/NewRequestScreen";

export const metadata: Metadata = { title: "New request" };

export default function Page() {
  return (
    <Suspense>
      <NewRequestScreen />
    </Suspense>
  );
}
