import type { MetadataRoute } from "next"

import { listAllForumSlugsForSitemap } from "@/lib/server/repositories/forum-repository"
import { listForumCategoriesPublic } from "@/lib/server/repositories/forum-categories-repository"
import { listAllBlogSlugsForSitemap } from "@/lib/server/repositories/blog-repository"
import { listAllStoreSlugsForSitemap } from "@/lib/server/repositories/store-repository"
import { listAllPeripheralSlugsForSitemap } from "@/lib/server/repositories/peripherals-repository"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { ALL_CATEGORIES, CATEGORY_PLURAL_LABELS } from "@/lib/tag-options"
import { SITE_URL } from "@/lib/site-url"


/**
 * O sitemap é gerado no build (rota estática). Sem isto, um periférico ou post
 * cadastrado pelo admin só era anunciado ao Google no deploy seguinte — em
 * semana sem deploy, conteúdo novo simplesmente não existia para o crawler.
 * Com o revalidate ele se regenera sozinho a cada 6 horas: 4 execuções por dia,
 * 5 queries indexadas cada, servido do CDN no intervalo. Mantê-lo estático (e
 * não `force-dynamic`) é deliberado — são 600+ URLs, e regerar isso a cada
 * request de bot seria caro sem ganho nenhum.
 */
export const revalidate = 21600

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/forum", priority: 0.9, changeFrequency: "hourly" },
  { path: "/blog", priority: 0.8, changeFrequency: "daily" },
  { path: "/noticias", priority: 0.8, changeFrequency: "daily" },
  { path: "/perifericos", priority: 0.8, changeFrequency: "daily" },
  { path: "/tierlist", priority: 0.7, changeFrequency: "weekly" },
  { path: "/videos", priority: 0.6, changeFrequency: "weekly" },
  { path: "/ranking", priority: 0.6, changeFrequency: "weekly" },
  { path: "/pessoas", priority: 0.5, changeFrequency: "weekly" },
  { path: "/changelog", priority: 0.3, changeFrequency: "weekly" },
  // Institucional e legal: baixa prioridade, mas o Google usa essas páginas
  // como sinal de confiança (E-E-A-T), sobretudo para um site que vende.
  { path: "/quem-somos", priority: 0.4, changeFrequency: "monthly" },
  { path: "/suporte", priority: 0.3, changeFrequency: "monthly" },
  { path: "/termos", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacidade", priority: 0.2, changeFrequency: "yearly" },
  { path: "/trocas-e-devolucoes", priority: 0.2, changeFrequency: "yearly" },
]

// Site pequeno/médio: sitemap único é suficiente (bem abaixo do limite de
// 50 mil URLs por arquivo do protocolo). Se o fórum crescer muito, isso vira
// um sitemap index com arquivos separados por seção.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A Loja em manutenção responde `ComingSoon` em toda rota de produto —
  // anunciá-las no sitemap mandaria o Google indexar páginas que hoje não
  // têm o conteúdo prometido.
  const storeEnabled = !isStoreMaintenanceEnabled()

  const [forumPosts, categories, blogPosts, storeProducts, peripherals] = await Promise.all([
    listAllForumSlugsForSitemap(),
    listForumCategoriesPublic(),
    listAllBlogSlugsForSitemap(),
    storeEnabled ? listAllStoreSlugsForSitemap() : Promise.resolve([]),
    listAllPeripheralSlugsForSitemap(),
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

  const storeEntries: MetadataRoute.Sitemap = storeProducts.map((p) => ({
    url: `${SITE_URL}/loja/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: "daily" as const,
    // Página de produto é a que converte — prioridade acima do conteúdo
    // editorial, abaixo só das listagens principais.
    priority: 0.8,
  }))

  // Uma entrada por categoria de periférico. Passaram a ter canonical e
  // título próprios (ver `generateMetadata` em app/perifericos/page.tsx), então
  // são páginas legítimas — e o sitemap é o que informa o Google de que existem,
  // já que o filtro é aplicado no cliente e não há link rastreável para cada uma.
  const peripheralCategoryEntries: MetadataRoute.Sitemap = ALL_CATEGORIES.filter(
    (c) => CATEGORY_PLURAL_LABELS[c]
  ).map((c) => ({
    url: `${SITE_URL}/perifericos?category=${c}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }))

  // Cada ficha de periférico. É o maior acervo indexável do site e o que
  // responde a busca de cauda longa por modelo — anunciá-las explicitamente
  // evita depender do rastreio dos links da listagem paginada.
  const peripheralEntries: MetadataRoute.Sitemap = peripherals.map((p) => ({
    url: `${SITE_URL}/perifericos/${buildPeripheralSlug(p.name, p.id)}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }))

  const storeRootEntries: MetadataRoute.Sitemap = storeEnabled
    ? [{ url: `${SITE_URL}/loja`, changeFrequency: "daily" as const, priority: 0.9 }]
    : []

  return [
    ...staticEntries,
    ...storeRootEntries,
    ...categoryEntries,
    ...peripheralCategoryEntries,
    ...peripheralEntries,
    ...forumEntries,
    ...blogEntries,
    ...storeEntries,
  ]
}
