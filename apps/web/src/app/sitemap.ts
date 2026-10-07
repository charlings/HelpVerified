import type { MetadataRoute } from "next";
import { publicRoutes } from "@/config/routes";
import { site } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((path) => ({ url: new URL(path, site.url).toString() }));
}
