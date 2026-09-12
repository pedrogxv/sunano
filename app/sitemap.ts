import type { MetadataRoute } from "next"

import { listAllForumSlugsForSitemap } from "@/lib/server/repositories/forum-repository"
import { listForumCategoriesPublic } from "@/lib/server/repositories/forum-categories-repository"
import { listAllBlogSlugsForSitemap } from "@/lib/server/repositories/blog-repository"
import { listAllStoreSlugsForSitemap } from "@/lib/server/repositories/store-repository"
import { listAllPeripheralSlugsForSitemap } from "@/lib/server/repositories/peripherals-repository"
import { listProfileSlugsForSitemap } from "@/lib/server/repositories/users-repository"
import { isMaintenanceEnabled } from "@/lib/maintenance"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { profilePath } from "@/lib/profile-name"
import { ALL_CATEGORIES, CATEGORY_PLURAL_LABELS } from "@/lib/tag-options"
import { TIERLIST_CATEGORY_SLUGS } from "@/lib/tierlist-categories"
import { SITE_URL } from "@/lib/site-url"


/**
 * O sitemap é gerado no build (rota estática). Sem isto, um periférico ou post
 * cadastrado pelo admin só era anunciado ao Google no deploy seguinte — em
 * semana sem deploy, conteúdo novo simplesmente não existia para o crawler.
 * Com o revalidate ele se regenera sozinho a cada 6 horas: 4 execuções por dia,
 * 5 queries indexadas cada, servido do CDN no intervalo. Mantê-lo estático (e
 * não `force-dynamic`) é deliberado — são 600+ URLs, e regerar isso a cada
 * request de bot seria caro sem ganho nenhum.
 *
 * Consequência para a manutenção: a cópia em cache pode continuar sendo
 * servida por até 6h depois de ligar a flag. Isso é aceitável porque o
 * `robots.txt` (esse sim `force-dynamic`) passa a proibir o rastreamento na
 * hora — o crawler não vai buscar as URLs mesmo que o sitemap velho ainda as
 * liste. Trocar este arquivo para dinâmico custaria 6 queries por request de
 * bot o ano inteiro para melhorar só a janela de manutenção.
 */
export const revalidate = 21600

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/forum", priority: 0.9, changeFrequency: "hourly" },
  { path: "/blog", priority: 0.8, changeFrequency: "daily" },
  { path: "/noticias", priority: 0.8, changeFrequency: "daily" },
  { path: "/perifericos", priority: 0.8, changeFrequency: "daily" },
  { path: "/tierlist", priority: 0.7, changeFrequency: "weekly" },
  { path: "/tierlist/comunidade", priority: 0.5, changeFrequency: "daily" },
  { path: "/videos", priority: 0.6, changeFrequency: "weekly" },
  { path: "/ranking", priority: 0.6, changeFrequency: "weekly" },
  { path: "/pessoas", priority: 0.5, changeFrequency: "weekly" },
  { path: "/changelog", priority: 0.3, changeFrequency: "weekly" },
  // Institucional e legal: baixa prioridade, mas o Google usa essas páginas
  // como sinal de confiança (E-E-A-T), sobretudo para um site que vende.
  { path: "/informacoes", priority: 0.4, changeFrequency: "monthly" },
  { path: "/informacoes/central-de-aura", priority: 0.4, changeFrequency: "monthly" },
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
  // Site inteiro em manutenção: toda rota pública redireciona para
  // `/maintenance`. Continuar anunciando 600+ URLs mandaria o crawler bater
  // numa cadeia de redirects e arriscaria desindexar o site inteiro; além
  // disso as 6 queries abaixo rodariam contra um banco que pode estar no meio
  // de uma migração. O sitemap vazio é o estado honesto da janela.
  //
  // Esta rota NÃO passa pelo proxy (o matcher exclui `sitemap.xml`), por isso
  // a checagem precisa existir aqui dentro.
  if (isMaintenanceEnabled()) return []

  // A Loja em manutenção responde `ComingSoon` em toda rota de produto —
  // anunciá-las no sitemap mandaria o Google indexar páginas que hoje não
  // têm o conteúdo prometido.
  const storeEnabled = !isStoreMaintenanceEnabled()

  const [forumPosts, categories, blogPosts, newsPosts, storeProducts, peripherals, profiles] = await Promise.all([
    listAllForumSlugsForSitemap(),
    listForumCategoriesPublic(),
    // Separados por tipo: `/blog` e `/noticias` são rotas distintas, e
    // anunciar uma notícia sob `/blog/...` contradizia o canonical dela.
    listAllBlogSlugsForSitemap("review"),
    listAllBlogSlugsForSitemap("news"),
    storeEnabled ? listAllStoreSlugsForSitemap() : Promise.resolve([]),
    listAllPeripheralSlugsForSitemap(),
    listProfileSlugsForSitemap(),
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

  // Post de fórum é o conteúdo mais forte do site para rastreio: texto
  // original, escrito por uma pessoa, único por URL — o oposto das fichas e
  // perfis vazios que puseram 732 URLs em "Detectada, mas não indexada". Com o
  // sitemap encolhido pelo filtro de `lib/indexability.ts`, a prioridade sobe
  // de 0.6 para 0.8: é para cá que o crawl budget liberado deve ir primeiro.
  const forumEntries: MetadataRoute.Sitemap = forumPosts.map((p) => ({
    url: `${SITE_URL}/forum/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }))

  // Notícia envelhece rápido e é o conteúdo mais sensível a atraso de
  // rastreio — daí a frequência maior que a do blog.
  const newsEntries: MetadataRoute.Sitemap = newsPosts.map((p) => ({
    url: `${SITE_URL}/noticias/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  const storeEntries: MetadataRoute.Sitemap = storeProducts.map((p) => ({
    url: `${SITE_URL}/loja/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: "daily" as const,
    // Página de produto é a que converte — prioridade acima do conteúdo
    // editorial, abaixo só das listagens principais.
    priority: 0.8,
  }))

  // Uma entrada por categoria de periférico, na rota canônica
  // `/perifericos/categoria/<slug>` — não mais em `?category=`, que o Google
  // trata como candidato fraco a canonical. O sitemap é o que informa que elas
  // existem, já que o filtro é aplicado no cliente e não há link rastreável
  // para cada uma.
  const peripheralCategoryEntries: MetadataRoute.Sitemap = ALL_CATEGORIES.filter(
    (c) => CATEGORY_PLURAL_LABELS[c]
  ).map((c) => ({
    url: `${SITE_URL}/perifericos/categoria/${c}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }))

  // Uma entrada por categoria da tierlist (`/tierlist/<slug>` em pt-BR) — são
  // as páginas que ranqueiam para "tierlist de mouse", "tier list teclado
  // gamer" etc. Antes cada categoria vivia só em `?categoria=` client-side,
  // sem URL própria.
  const tierlistCategoryEntries: MetadataRoute.Sitemap = TIERLIST_CATEGORY_SLUGS.map((slug) => ({
    url: `${SITE_URL}/tierlist/${slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
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

  // O perfil público é conteúdo indexável e não era anunciado em lugar nenhum:
  // o diretório `/pessoas` pagina no cliente, então não havia link rastreável
  // para a maioria deles.
  //
  // `listProfileSlugsForSitemap` já devolve só quem tem atividade (ver
  // `lib/indexability.ts`), então o que chega aqui não é mais "todo mundo
  // cadastrado" — é quem escreveu, avaliou ou montou setup. Daí 0.5 em vez de
  // 0.4: ainda abaixo do conteúdo editorial, mas não mais no piso.
  const profileEntries: MetadataRoute.Sitemap = profiles.map((p) => ({
    url: `${SITE_URL}${profilePath(p.slug)}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }))

  const storeRootEntries: MetadataRoute.Sitemap = storeEnabled
    ? [{ url: `${SITE_URL}/loja`, changeFrequency: "daily" as const, priority: 0.9 }]
    : []

  return [
    ...staticEntries,
    ...storeRootEntries,
    ...categoryEntries,
    ...peripheralCategoryEntries,
    ...tierlistCategoryEntries,
    ...peripheralEntries,
    ...forumEntries,
    ...blogEntries,
    ...newsEntries,
    ...storeEntries,
    ...profileEntries,
  ]
}
