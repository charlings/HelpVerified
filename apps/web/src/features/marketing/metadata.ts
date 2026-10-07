import type { Metadata } from "next";
import { pageMeta, type PageKey } from "@/content/metadata";

// A page's own openGraph object replaces the root one, so the generated image (app/opengraph-image.tsx) is restated.
const ogImage = { url: "/opengraph-image", width: 1200, height: 630, alt: "HelpVerified" };

export function pageMetadata(key: PageKey): Metadata {
  const { title, description, path, absoluteTitle } = pageMeta[key];
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: [ogImage] },
  };
}
