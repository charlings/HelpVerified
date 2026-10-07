import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkersListScreen } from "@/features/workers/screens/WorkersListScreen";

export const metadata: Metadata = { title: "Workers" };

export default function Page() {
  return (
    <Suspense>
      <WorkersListScreen />
    </Suspense>
  );
}
