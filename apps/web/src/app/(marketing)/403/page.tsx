import type { Metadata } from "next";
import { StatusPage } from "@/components/layout/StatusPage";
import { routes } from "@/config/routes";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };

export default function Page() {
  return (
    <StatusPage
      code="403"
      title="You don't have access to this page"
      message="Your account doesn't have permission to view it. If you think this is a mistake, sign in with a different account."
      action={{ label: "Go to sign in", href: routes.auth.login }}
    />
  );
}
