import type { Metadata } from "next";
import { serviceSlugs, type ServiceSlug } from "@/config/routes";
import { pageMetadata } from "@/features/marketing";
import { ServiceDetailScreen } from "@/features/marketing/screens/ServiceDetailScreen";

type Props = { params: Promise<{ slug: ServiceSlug }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return serviceSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(slug);
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <ServiceDetailScreen slug={slug} />;
}
