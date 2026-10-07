import type { Metadata } from "next";
import { NewWorkerScreen } from "@/features/workers/screens/NewWorkerScreen";

export const metadata: Metadata = { title: "Add worker" };

export default function Page() {
  return <NewWorkerScreen />;
}
