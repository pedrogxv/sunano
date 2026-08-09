import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site-url"


export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/conta", "/checkout", "/auth", "/2fa", "/reset-password", "/forgot-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
