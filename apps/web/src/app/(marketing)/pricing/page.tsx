import { pageMetadata } from "@/features/marketing";
import { PricingScreen } from "@/features/marketing/screens/PricingScreen";

export const metadata = pageMetadata("pricing");

export default function Page() {
  return <PricingScreen />;
}
