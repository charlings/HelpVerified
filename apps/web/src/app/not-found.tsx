import type { Metadata } from "next";
import { MarketingFrame } from "@/components/layout/MarketingFrame";
import { StatusPage } from "@/components/layout/StatusPage";
import { routes } from "@/config/routes";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MarketingFrame>
      <StatusPage
        code="404"
        title="We couldn't find that page"
        message="The link may be broken or the page may have moved."
        action={{ label: "Back to home", href: routes.home }}
      />
    </MarketingFrame>
  );
}
