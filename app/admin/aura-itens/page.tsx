"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Coins,
  Edit,
  EyeOff,
  PackageCheck,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { AuraAmount } from "@/components/ui/AuraIcon"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AURA_ITEM_GROUP_META,
  AURA_ITEM_GROUP_ORDER,
  auraItemKindMeta,
  auraItemTracksStock,
  type AuraItemKindGroup,
} from "@/lib/aura-item-kinds"
import { auraPriceFor } from "@/lib/aura-pricing"
import { cn } from "@/lib/utils"
import type {
  AuraItemAdmin,
  AuraPurchaseItemSummary,
} from "@/lib/server/repositories/aura-store-repository"

// ── helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("pt-BR")
}

function compactAura(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
  if (Math.abs(n) >= 1000)
    return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
  return fmt(n)
}

/**
 * Estoque restante de um prêmio físico. A coluna `stock` é o total cadastrado
 * e NÃO decrementa aqui — quem consome é a RPC `redeem_aura_peripheral`; o
 * painel deriva o restante subtraindo as compras concluídas do resumo. Por
 * isso o cálculo mora numa função só, e não espalhado pelos cards.
 */
function stockState(item: AuraItemAdmin, claimed: number) {
  const total = Math.max(item.stock, 0)
  const left = Math.max(total - claimed, 0)
  const ratio = total > 0 ? left / total : 0
  const soldOut = left === 0
  const low = !soldOut && (left <= 1 || ratio <= 0.25)
  return { total, left, claimed, ratio, soldOut, low }
}

// ── stat card ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Coins
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className={cn("absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-2xl", accent)} />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
          <Icon className="size-4 text-foreground/80" />
        </div>
      </div>
    </div>
  )
}

// ── card do item ─────────────────────────────────────────────────────────

function ItemCard({
  item,
  summary,
  onDelete,
}: {
  item: AuraItemAdmin
  summary?: AuraPurchaseItemSummary
  onDelete: () => void
}) {
  const meta = auraItemKindMeta(item.kind)
  const KindIcon = meta.icon
  const claimed = summary?.count ?? 0
  const tracksStock = auraItemTracksStock(item.kind)
  const stock = tracksStock ? stockState(item, claimed) : null

  // A arte que representa o item difere por natureza: o físico é uma foto de
  // produto (preenche o quadro), a moldura é um PNG transparente que precisa
  // respirar num fundo xadrez pra se ler a transparência.
  const art = item.kind === "peripheral" ? item.imageUrl : (item.frameAssetUrl ?? item.imageUrl)

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors",
        stock?.soldOut
          ? "border-red-500/30"
          : stock?.low
            ? "border-amber-500/30"
            : "border-border hover:border-foreground/20",
        !item.active && "opacity-60"
      )}
    >
      {/* Faixa superior: arte + tipo */}
      <div className="relative flex items-center gap-3 border-b border-border/60 p-4">
        <div
          className={cn(
            "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border",
            item.kind === "peripheral" ? "bg-muted/30" : "aura-admin-checker"
          )}
        >
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={art}
              alt={item.name}
              className={cn(
                "h-full w-full",
                item.kind === "peripheral" ? "object-cover" : "object-contain p-1"
              )}
            />
          ) : (
            <KindIcon className="size-6 text-muted-foreground/60" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("gap-1 px-1.5 py-0 text-[10px] font-medium", meta.badgeClassName)}
            >
              <KindIcon className="size-2.5" />
              {meta.label}
            </Badge>
            {!item.active && (
              <Badge
                variant="outline"
                className="gap-1 border-border bg-muted/40 px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                <EyeOff className="size-2.5" />
                Oculto
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-foreground" title={item.name}>
            {item.name}
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground/60" title={item.slug}>
            {item.slug}
          </p>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-muted-foreground">
          {item.description || <span className="italic text-muted-foreground/50">Sem descrição.</span>}
        </p>

        {/* Estoque — a diferença que mais importa entre físico e genérico.
            Físico ganha barra e contagem; genérico afirma que é ilimitado, em
            vez de deixar o vazio sugerir "esgotado". */}
        {stock ? (
          <div
            className={cn(
              "rounded-xl border p-3",
              stock.soldOut
                ? "border-red-500/25 bg-red-500/5"
                : stock.low
                  ? "border-amber-500/25 bg-amber-500/5"
                  : "border-border bg-muted/20"
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Boxes className="size-3" />
                Estoque
              </span>
              <span
                className={cn(
                  "text-xs font-bold tabular-nums",
                  stock.soldOut
                    ? "text-red-400"
                    : stock.low
                      ? "text-amber-400"
                      : "text-foreground"
                )}
              >
                {stock.soldOut ? "Esgotado" : `${fmt(stock.left)} de ${fmt(stock.total)}`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  stock.soldOut ? "bg-red-500" : stock.low ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.round(stock.ratio * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {stock.soldOut
                ? "Sumiu da Central. Aumente as unidades para reabrir."
                : `${fmt(stock.claimed)} resgatado${stock.claimed === 1 ? "" : "s"} · entrega por correio`}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="size-3" />
              Item digital
            </span>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Sem estoque — resgates ilimitados. {meta.blurb}
            </p>
          </div>
        )}

        {/* Números */}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Preço</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
              <AuraAmount value={item.auraCost} />
            </p>
            {/* Prêmio físico é o único que não recebe o desconto VIP, então só
                nele o preço de tabela é o preço final para todo mundo. */}
            <p className="text-[9px] text-muted-foreground/70">
              {tracksStock
                ? "sem desconto VIP"
                : `VIP: ${fmt(auraPriceFor(item.auraCost, "vip").finalPrice)}`}
            </p>
          </div>
          {claimed > 0 ? (
            <Link
              href={`/admin/aura-itens/compras?itemId=${item.id}`}
              className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 transition-colors hover:bg-violet-500/20"
            >
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-violet-300/80">
                <ShoppingCart className="size-2.5" />
                Resgates
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-violet-200">
                {fmt(claimed)}
                <span className="ml-1 text-[10px] font-medium text-violet-300/70">
                  · {compactAura(summary?.auraTotal ?? 0)}
                </span>
              </p>
            </Link>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Resgates</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-muted-foreground/50">—</p>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé de ações */}
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
        <span className="text-[10px] text-muted-foreground/60">Ordem {item.sortOrder}</span>
        <div className="flex items-center gap-1">
          <Link href={`/admin/aura-itens/${item.id}`}>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
              <Edit className="size-3" />
              Editar
            </Button>
          </Link>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-red-500/60 hover:text-red-400"
            onClick={onDelete}
            aria-label={`Deletar ${item.name}`}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── página ───────────────────────────────────────────────────────────────

export default function AdminAuraItemsPage() {
  const [items, setItems] = useState<AuraItemAdmin[]>([])
  const [summary, setSummary] = useState<Record<string, AuraPurchaseItemSummary>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [groupFilter, setGroupFilter] = useState<AuraItemKindGroup | "all">("all")
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Catálogo e resumo de compras em paralelo — o resumo é best-effort,
      // uma falha nele não impede a listagem dos itens.
      const [itemsRes, summaryRes] = await Promise.all([
        fetch("/api/admin/aura-itens"),
        fetch("/api/admin/aura-itens/purchases/summary"),
      ])
      const data = (await itemsRes.json()) as { items?: AuraItemAdmin[]; error?: string }
      if (!itemsRes.ok) throw new Error(data.error ?? "Erro ao carregar")
      setItems(data.items ?? [])

      if (summaryRes.ok) {
        const s = (await summaryRes.json()) as { summary?: Record<string, AuraPurchaseItemSummary> }
        setSummary(s.summary ?? {})
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar itens de Aura", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete() {
    if (!deleteDialog.id) return
    const target = items.find((i) => i.id === deleteDialog.id)
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/aura-itens/${deleteDialog.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      setItems((prev) => prev.filter((i) => i.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
      toast.success("Item deletado", { description: target?.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao deletar"
      setError(message)
      toast.error("Erro ao deletar item", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  usePageHeader(
    "Itens de Aura",
    "Catálogo da Central de Aura: prêmios físicos com estoque real, cosméticos ilimitados e benefícios do sistema."
  )

  // Estatísticas do topo. O alerta de estoque é o que justifica a página
  // existir como painel e não como lista: prêmio esgotado some da Central em
  // silêncio, e quase-esgotado é decisão de reposição.
  const stats = useMemo(() => {
    const physical = items.filter((i) => auraItemTracksStock(i.kind))
    let unitsLeft = 0
    let soldOut = 0
    let low = 0
    for (const it of physical) {
      const s = stockState(it, summary[it.id]?.count ?? 0)
      unitsLeft += s.left
      if (s.soldOut) soldOut += 1
      else if (s.low) low += 1
    }
    const redemptions = Object.values(summary).reduce((acc, s) => acc + s.count, 0)
    const auraTotal = Object.values(summary).reduce((acc, s) => acc + s.auraTotal, 0)
    return {
      total: items.length,
      active: items.filter((i) => i.active).length,
      physicalCount: physical.length,
      unitsLeft,
      soldOut,
      low,
      redemptions,
      auraTotal,
    }
  }, [items, summary])

  // Agrupa por natureza (físico → cosmético → sistema) respeitando o
  // `sort_order` que o backend já devolve ordenado.
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase()
    const filtered = items.filter((it) => {
      const meta = auraItemKindMeta(it.kind)
      if (groupFilter !== "all" && meta.group !== groupFilter) return false
      if (!term) return true
      return (
        it.name.toLowerCase().includes(term) ||
        it.slug.toLowerCase().includes(term) ||
        meta.label.toLowerCase().includes(term)
      )
    })

    return AURA_ITEM_GROUP_ORDER.map((group) => ({
      group,
      meta: AURA_ITEM_GROUP_META[group],
      items: filtered.filter((it) => auraItemKindMeta(it.kind).group === group),
    })).filter((g) => g.items.length > 0)
  }, [items, query, groupFilter])

  const matchCount = groups.reduce((acc, g) => acc + g.items.length, 0)
  const hasFilters = query.trim() !== "" || groupFilter !== "all"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/admin/aura-itens/compras">
          <Button variant="outline" className="gap-2">
            <Receipt className="size-4" />
            Histórico de compras
          </Button>
        </Link>
        <Link href="/admin/aura-itens/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Novo item
          </Button>
        </Link>
      </div>

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Sparkles className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum item cadastrado</p>
          <Link href="/admin/aura-itens/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Criar item
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Sparkles}
              label="No catálogo"
              value={fmt(stats.total)}
              sub={`${fmt(stats.active)} visíveis na Central`}
              accent="bg-violet-500"
            />
            <StatCard
              icon={PackageCheck}
              label="Unidades físicas"
              value={fmt(stats.unitsLeft)}
              sub={`em ${fmt(stats.physicalCount)} prêmio${stats.physicalCount === 1 ? "" : "s"} real${stats.physicalCount === 1 ? "" : "is"}`}
              accent="bg-amber-500"
            />
            <StatCard
              icon={ShoppingCart}
              label="Resgates"
              value={fmt(stats.redemptions)}
              sub="todo o histórico"
              accent="bg-emerald-500"
            />
            <StatCard
              icon={Coins}
              label="Aura arrecadada"
              value={compactAura(stats.auraTotal)}
              sub="queimada em resgates"
              accent="bg-sky-500"
            />
          </div>

          {/* Alerta de estoque — só aparece quando há o que decidir. */}
          {(stats.soldOut > 0 || stats.low > 0) && (
            <Alert className="border-amber-500/30 bg-amber-500/10 py-2.5">
              <AlertTriangle className="size-3.5 text-amber-400" />
              <AlertDescription className="text-xs text-amber-200">
                {stats.soldOut > 0 && (
                  <>
                    <strong>{fmt(stats.soldOut)}</strong> prêmio{stats.soldOut === 1 ? "" : "s"} esgotado
                    {stats.soldOut === 1 ? "" : "s"} — some{stats.soldOut === 1 ? "" : "m"} da Central até
                    repor as unidades.
                  </>
                )}
                {stats.soldOut > 0 && stats.low > 0 && " "}
                {stats.low > 0 && (
                  <>
                    <strong>{fmt(stats.low)}</strong> com estoque baixo.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, slug ou tipo…"
                className="h-9 pl-8 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={groupFilter === "all" ? "secondary" : "ghost"}
                onClick={() => setGroupFilter("all")}
                className="h-9 text-xs"
              >
                Tudo
              </Button>
              {AURA_ITEM_GROUP_ORDER.map((group) => {
                const meta = AURA_ITEM_GROUP_META[group]
                const GroupIcon = meta.icon
                return (
                  <Button
                    key={group}
                    size="sm"
                    variant={groupFilter === group ? "secondary" : "ghost"}
                    onClick={() => setGroupFilter(group)}
                    className="h-9 gap-1.5 text-xs"
                  >
                    <GroupIcon className="size-3.5" />
                    {meta.label}
                  </Button>
                )
              })}
            </div>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("")
                  setGroupFilter("all")
                }}
                className="h-9 gap-1.5 text-muted-foreground"
              >
                <X className="size-3.5" />
                Limpar
              </Button>
            )}
          </div>

          {matchCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-14 text-center">
              <Search className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum item bate com o filtro</p>
            </div>
          ) : (
            groups.map(({ group, meta, items: groupItems }) => {
              const GroupIcon = meta.icon
              return (
                <section key={group} className="space-y-3">
                  <div className="flex flex-wrap items-start gap-3 border-l-2 border-border pl-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
                      <GroupIcon className="size-4 text-foreground/70" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                        <Badge
                          variant="outline"
                          className="border-border bg-muted/40 px-1.5 py-0 text-[10px] text-muted-foreground"
                        >
                          {fmt(groupItems.length)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {groupItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        summary={summary[item.id]}
                        onDelete={() => setDeleteDialog({ open: true, id: item.id })}
                      />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </>
      )}

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Deletar item?</DialogTitle>
            <DialogDescription>
              Quem já resgatou este item perde a posse (molduras somem do perfil equipado; o
              histórico de compras é preservado por snapshot).
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const target = items.find((i) => i.id === deleteDialog.id)
            if (!target || !auraItemTracksStock(target.kind)) return null
            const claimed = summary[target.id]?.count ?? 0
            if (claimed === 0) return null
            return (
              <Alert className="border-amber-500/30 bg-amber-500/10 py-2">
                <AlertTriangle className="size-3.5 text-amber-400" />
                <AlertDescription className="text-xs text-amber-200">
                  Este é um prêmio físico com <strong>{fmt(claimed)}</strong> resgate
                  {claimed === 1 ? "" : "s"}. Os pedidos de entrega já criados continuam válidos e
                  precisam ser enviados normalmente.
                </AlertDescription>
              </Alert>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: "" })} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deletando..." : "Deletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
