import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site-url"


export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `/api` inteiro ficaria bloqueado, e junto com ele `/api/og` — que é
      // de onde vem TODA imagem de preview do site. Facebook, X e LinkedIn
      // respeitam robots.txt ao buscar `og:image`: bloqueado, o card sai sem
      // imagem. Por isso o allow mais específico vem antes.
      allow: ["/", "/api/og"],
      disallow: [
        "/admin",
        "/api/",
        "/conta",
        "/checkout",
        "/auth",
        "/2fa",
        "/reset-password",
        "/forgot-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
