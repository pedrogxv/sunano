import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { buildMetadata } from "@/lib/seo"
import { profilePath } from "@/lib/profile-name"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { translations, DEFAULT_LOCALE } from "@/lib/i18n"
import { getTierlistMeta } from "@/lib/server/repositories/tierlist-meta-repository"
import {
  coerceCommunityTierlistSort,
  listCommunityTierlists,
  type CommunityTierlistSort,
} from "@/lib/server/repositories/user-tierlist-repository"
import { BreadcrumbJsonLd, ItemListJsonLd } from "@/components/seo/JsonLd"
import { TierlistPageHeader } from "@/components/tierlist/TierlistPageHeader"
import { CommunityTierlistCard } from "@/components/tierlist/CommunityTierlistCard"

// Lê `searchParams` (ordem + página) — dinâmica por definição. `listCommunityTierlists`
// é cacheada (60 s) por sort+página, então a rajada de bots/navegação não repete
// as queries.
export const dynamic = "force-dynamic"

const PAGE_SIZE = 12

const BASE_METADATA = buildMetadata({
  title: "Tierlists da Comunidade",
  socialTitle: "As tierlists dos membros da Sunano",
  description:
    "Navegue pelas tierlists pessoais dos membros da Sunano: como cada um classifica os periféricos que já usou, ordenadas por curtidas, tamanho e novidade.",
  path: "/tierlist/comunidade",
  eyebrow: "Tierlist",
  subtitle: "As tierlists dos membros",
})

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ ordenar?: string; pagina?: string }>
}): Promise<Metadata> {
  const { ordenar, pagina } = await searchParams
  const sort = coerceCommunityTierlistSort(ordenar)
  const page = Math.max(1, Number(pagina) || 1)

  // Página 1 na ordem padrão: canonical na rota base. Qualquer variação
  // (?ordenar= ou ?pagina=2+) recebe canonical PARA SI MESMA e `noindex,
  // follow` — assim o Google não descarta os cards que só existem na página 2
  // (o que o canonical-para-a-base fazia), mas também não indexa dezenas de
  // variações rasas.
  const isBase = sort === "hearts" && page === 1
  if (isBase) return BASE_METADATA

  return {
    ...BASE_METADATA,
    alternates: { canonical: pageHref(sort, page) },
    robots: { index: false, follow: true },
  }
}

function pageHref(sort: CommunityTierlistSort, page: number) {
  const params = new URLSearchParams()
  if (sort !== "hearts") params.set("ordenar", sort)
  if (page > 1) params.set("pagina", String(page))
  const qs = params.toString()
  return qs ? `/tierlist/comunidade?${qs}` : "/tierlist/comunidade"
}

export default async function CommunityTierlistsPage({
  searchParams,
}: {
  searchParams: Promise<{ ordenar?: string; pagina?: string }>
}) {
  const { ordenar, pagina } = await searchParams
  // Locale é resolvido no cliente neste projeto (locale-context); numa página
  // server renderizamos com o idioma padrão — mesmo caminho de
  // `app/perfil/[handle]/tierlist`.
  const t = translations[DEFAULT_LOCALE]

  const sort = coerceCommunityTierlistSort(ordenar)
  const page = Math.max(1, Number(pagina) || 1)

  const [{ rows, total }, tierlistMeta] = await Promise.all([
    listCommunityTierlists({ sort, page, pageSize: PAGE_SIZE }),
    getTierlistMeta(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const itemListEntries = rows.map((row) => ({
    name: `Tierlist de ${row.user.displayName}`,
    url: `${profilePath(row.user.displaySlug)}/tierlist`,
  }))

  const sortTabs: { id: CommunityTierlistSort; label: string }[] = [
    { id: "hearts", label: t.tierlist.community.sortHearts },
    { id: "items", label: t.tierlist.community.sortItems },
    { id: "recent", label: t.tierlist.community.sortRecent },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-2 py-5 sm:px-3 md:space-y-5 md:px-6 md:py-6 lg:px-8">
      <BreadcrumbJsonLd
        items={[
          { name: "Início", item: "/" },
          { name: "Tierlist", item: "/tierlist" },
          { name: "Comunidade", item: "/tierlist/comunidade" },
        ]}
      />
      <ItemListJsonLd items={itemListEntries} name="Tierlists da Comunidade" />

      <TierlistPageHeader active="comunidade" latestUpdate={tierlistMeta} />

      <p className="text-sm text-muted-foreground">{t.tierlist.community.subtitle}</p>

      {/* Ordenação: <Link>s (não estado) — trocar de ordem sempre volta pra
          página 1 e o SSR relê tudo. */}
      <nav className="flex flex-wrap gap-1.5">
        {sortTabs.map((tab) => {
          const isActive = sort === tab.id
          return (
            <Link
              key={tab.id}
              href={pageHref(tab.id, 1)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-2 text-xs font-semibold transition-all",
                isActive
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {total === 0 ? (
        <div className={cn("rounded-xl border p-10 text-center", CARD_SURFACE)}>
          <p className="text-sm text-muted-foreground">{t.tierlist.community.empty}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <CommunityTierlistCard key={row.user.id} data={row} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              {page > 1 ? (
                <Link
                  href={pageHref(sort, page - 1)}
                  rel="prev"
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  <ChevronLeft className="size-4" />
                  {t.tierlist.community.prev}
                </Link>
              ) : (
                <span />
              )}

              <span className="text-xs text-muted-foreground">
                {t.tierlist.community.pageOf(page, totalPages)}
              </span>

              {page < totalPages ? (
                <Link
                  href={pageHref(sort, page + 1)}
                  rel="next"
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  {t.tierlist.community.next}
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
