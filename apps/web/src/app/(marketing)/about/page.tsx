import { pageMetadata } from "@/features/marketing";
import { AboutScreen } from "@/features/marketing/screens/AboutScreen";

export const metadata = pageMetadata("about");

export default function Page() {
  return <AboutScreen />;
}
