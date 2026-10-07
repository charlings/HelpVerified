import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminAgenciesScreen } from "@/features/admin/screens/AdminAgenciesScreen";

export const metadata: Metadata = { title: "Agencies" };

export default function Page() {
  return (
    <Suspense>
      <AdminAgenciesScreen />
    </Suspense>
  );
}
