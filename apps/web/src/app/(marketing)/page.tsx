import { pageMetadata } from "@/features/marketing";
import { HomeScreen } from "@/features/marketing/screens/HomeScreen";

export const metadata = pageMetadata("home");

export default function Page() {
  return <HomeScreen />;
}
