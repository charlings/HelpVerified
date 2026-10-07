import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StyleguideScreen } from "@/features/styleguide";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_STYLEGUIDE !== "true") notFound();
  return <StyleguideScreen />;
}
