import { pageMetadata } from "@/features/marketing";
import { HowItWorksScreen } from "@/features/marketing/screens/HowItWorksScreen";

export const metadata = pageMetadata("howItWorks");

export default function Page() {
  return <HowItWorksScreen />;
}
