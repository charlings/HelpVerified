import { pageMetadata } from "@/features/marketing";
import { LegalScreen } from "@/features/marketing/screens/LegalScreen";

export const metadata = pageMetadata("privacy");

export default function Page() {
  return <LegalScreen document="privacy" />;
}
