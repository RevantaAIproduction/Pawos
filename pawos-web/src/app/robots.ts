import type { MetadataRoute } from "next";
import { OFFICIAL_SITE_ORIGIN } from "../lib/siteOrigin";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/checkout"],
    },
    sitemap: `${OFFICIAL_SITE_ORIGIN}/sitemap.xml`,
  };
}
