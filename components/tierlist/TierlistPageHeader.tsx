"use client"

import Link from "next/link"
import { Clock, Crown, Info, ListChecks, Users } from "lucide-react"

import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { formatTierlistDate } from "@/lib/format-tierlist-date"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { TierlistInfo } from "./TierlistInfo"

type LatestUpdate = {
  latestUpdateDescription: string
  updatedAt: string
}

type View = "oficial" | "pessoal" | "comunidade"

/**
 * Header único do topo das três páginas da Tierlist (`/tierlist`,
 * `/tierlist/pessoal`, `/tierlist/comunidade`).
 *
 * Um card só: `<h1>` da página (discreto), seletor das três visões, a data da
 * última atualização como chip, e o "Como funciona" como uma tag à parte
 * (abre um popover com Sobre/Categorias/Critérios/…), não mais como faixa
 * expansível ocupando a largura toda.
 */
export function TierlistPageHeader({
  active,
  latestUpdate,
  heading,
  sharePath,
}: {
  active: View
  latestUpdate?: LatestUpdate | null
  /**
   * `<h1>` visível da página. As páginas passam o título da categoria
   * (`Tierlist de Mouses`) ou o nome da visão; sem isso cai num rótulo padrão.
   */
  heading?: string
  /**
   * Caminho canônico a compartilhar (ex: "/tierlist/mouses"). Quem passa é a
   * página no servidor, que já conhece o canonical — assim o header não
   * precisa de `useSearchParams` (que forçaria bailout de CSR nestas rotas
   * estáticas). Sem este prop o botão não aparece: `/tierlist/pessoal` e
   * `/tierlist/comunidade` têm o compartilhar próprio, com a URL do dono.
   */
  sharePath?: string
}) {
  const t = useT()
  const { locale } = useLocale()

  const views: { id: View; href: string; label: string; icon: typeof ListChecks; vip?: boolean }[] = [
    { id: "oficial", href: "/tierlist", label: t.tierlist.views.official, icon: ListChecks },
    { id: "pessoal", href: "/tierlist/pessoal", label: t.tierlist.views.mine, icon: Crown, vip: true },
    { id: "comunidade", href: "/tierlist/comunidade", label: t.tierlist.views.community, icon: Users },
  ]

  const updatedLabel = latestUpdate?.updatedAt
    ? formatTierlistDate(latestUpdate.updatedAt, locale)
    : null

  const h1 =
    heading ??
    (active === "comunidade"
      ? t.tierlist.community.title
      : active === "pessoal"
        ? t.tierlist.views.mine
        : "Tierlist de Periféricos Gamers")

  return (
    <section className={cn("rounded-xl border p-3 sm:p-4", CARD_SURFACE)}>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-base font-bold text-foreground sm:text-lg">{h1}</h1>
        {sharePath && <ShareMenu title={`${h1} - Sunano`} path={sharePath} showEmbed={false} />}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Seletor das três visões — pílulas com ícone. */}
        <nav className="flex flex-wrap gap-1.5">
          {views.map((view) => {
            const Icon = view.icon
            const isActive = active === view.id
            return (
              <Link
                key={view.id}
                href={view.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all",
                  isActive
                    ? view.vip
                      ? "border-transparent"
                      : "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                style={
                  view.vip && isActive
                    ? { backgroundColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }
                    : view.vip
                      ? { color: "var(--vip-accent)" }
                      : undefined
                }
              >
                <Icon className="size-3.5" />
                {view.label}
              </Link>
            )
          })}
        </nav>

        {/* "Como funciona" — tag à parte das visões (separador visual + popover),
            não mais uma faixa expansível na largura toda. */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Info className="size-3.5 text-primary" />
              {t.tierlist.howItWorks}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[70vh] w-[min(92vw,26rem)] overflow-y-auto rounded-xl border-border bg-popover p-4 shadow-xl"
          >
            <TierlistInfo latestUpdate={latestUpdate} />
          </PopoverContent>
        </Popover>

        {updatedLabel && (
          <span
            className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground"
            title={t.tierlist.updatedAt(updatedLabel)}
          >
            <Clock className="size-3" />
            {updatedLabel}
          </span>
        )}
      </div>
    </section>
  )
}
