import { pageMetadata } from "@/features/marketing";
import { ServicesScreen } from "@/features/marketing/screens/ServicesScreen";

export const metadata = pageMetadata("services");

export default function Page() {
  return <ServicesScreen />;
}
