import type { MetadataRoute } from "next";
import { privatePrefixes, routes } from "@/config/routes";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: routes.home, disallow: [...privatePrefixes] },
    sitemap: new URL("/sitemap.xml", site.url).toString(),
  };
}
