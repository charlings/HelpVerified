import { pageMetadata } from "@/features/marketing";
import { ContactScreen } from "@/features/marketing/screens/ContactScreen";

export const metadata = pageMetadata("contact");

export default function Page() {
  return <ContactScreen />;
}
