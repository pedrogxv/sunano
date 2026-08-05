import type { MetadataRoute } from "next"

import { listAllForumSlugsForSitemap } from "@/lib/server/repositories/forum-repository"
import { listForumCategoriesPublic } from "@/lib/server/repositories/forum-categories-repository"
import { listAllBlogSlugsForSitemap } from "@/lib/server/repositories/blog-repository"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://sunano.com.br"

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/forum", priority: 0.9, changeFrequency: "hourly" },
  { path: "/blog", priority: 0.8, changeFrequency: "daily" },
  { path: "/noticias", priority: 0.8, changeFrequency: "daily" },
  { path: "/perifericos", priority: 0.8, changeFrequency: "daily" },
  { path: "/tierlist", priority: 0.7, changeFrequency: "weekly" },
  { path: "/ranking", priority: 0.6, changeFrequency: "weekly" },
  { path: "/pessoas", priority: 0.5, changeFrequency: "weekly" },
]

// Site pequeno/médio: sitemap único é suficiente (bem abaixo do limite de
// 50 mil URLs por arquivo do protocolo). Se o fórum crescer muito, isso vira
// um sitemap index com arquivos separados por seção.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [forumPosts, categories, blogPosts] = await Promise.all([
    listAllForumSlugsForSitemap(),
    listForumCategoriesPublic(),
    listAllBlogSlugsForSitemap(),
  ])

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const categoryEntries: MetadataRoute.Sitemap = categories.flatMap((root) => [
    {
      url: `${SITE_URL}/forum/categoria/${root.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    },
    ...root.children.map((child) => ({
      url: `${SITE_URL}/forum/categoria/${child.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
  ])

  const forumEntries: MetadataRoute.Sitemap = forumPosts.map((p) => ({
    url: `${SITE_URL}/forum/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }))

  return [...staticEntries, ...categoryEntries, ...forumEntries, ...blogEntries]
}
