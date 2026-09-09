"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  Coins,
  Crown,
  Gem,
  Keyboard,
  Layers,
  Loader2,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  AuraItemAdmin,
  AuraItemKind,
  AuraPurchaseRow,
  AuraPurchaseTotals,
} from "@/lib/server/repositories/aura-store-repository"

// ── helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("pt-BR")
}

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
  return fmt(n)
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `${min} min atrás`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h atrás`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d atrás`
  return new Date(iso).toLocaleDateString("pt-BR")
}

const KIND_META: Record<AuraItemKind, { label: string; icon: typeof Sparkles; className: string }> = {
  avatar_frame: { label: "Moldura", icon: Sparkles, className: "text-violet-300 bg-violet-500/10 border-violet-500/25" },
  vip_month: { label: "VIP", icon: Crown, className: "text-amber-300 bg-amber-500/10 border-amber-500/25" },
  display_name_change: { label: "Troca de nome", icon: UserRound, className: "text-sky-300 bg-sky-500/10 border-sky-500/25" },
  streak_shield: { label: "Escudo", icon: ShieldCheck, className: "text-cyan-300 bg-cyan-500/10 border-cyan-500/25" },
  mini_profile_bg: { label: "Fundo de perfil", icon: Layers, className: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/25" },
  peripheral: { label: "Produto", icon: Keyboard, className: "text-amber-300 bg-amber-500/10 border-amber-500/25" },
}

type BuyerHit = {
  id: string
  displayName: string
  displaySlug: string | null
  avatarUrl: string | null
}

// ── user filter combobox ─────────────────────────────────────────────────

function UserFilter({
  value,
  onChange,
}: {
  value: BuyerHit | null
  onChange: (u: BuyerHit | null) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<BuyerHit[]>([])
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/aura-itens/purchases?users=${encodeURIComponent(term)}`)
        const data = (await res.json()) as { users?: BuyerHit[] }
        if (!cancelled) setHits(data.users ?? [])
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <UserAvatar name={value.displayName} avatarUrl={value.avatarUrl} size={6} />
        <span className="max-w-[160px] truncate text-sm font-medium text-foreground">{value.displayName}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setQuery("")
          }}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Limpar filtro de usuário"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Filtrar por usuário…"
          className="h-9 w-[220px] pl-8 text-sm"
        />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-[280px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {hits.length === 0 && !searching ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
          ) : (
            hits.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onChange(u)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size={7} />
                <span className="truncate text-sm text-foreground">{u.displayName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
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
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn("flex size-9 items-center justify-center rounded-xl bg-foreground/5")}>
          <Icon className="size-4 text-foreground/80" />
        </div>
      </div>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────

function PurchasesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [items, setItems] = useState<AuraItemAdmin[]>([])
  const [itemId, setItemId] = useState<string>(searchParams.get("itemId") ?? "all")
  const [kind, setKind] = useState<string>(searchParams.get("kind") ?? "all")
  const [buyer, setBuyer] = useState<BuyerHit | null>(null)

  const [rows, setRows] = useState<AuraPurchaseRow[]>([])
  const [totals, setTotals] = useState<AuraPurchaseTotals>({ grossAura: 0, purchases: 0, uniqueBuyers: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  usePageHeader("Histórico de compras da Aura", "Toda compra da Central de Aura — item, valor pago e carteira antes/depois.")

  // Carrega o catálogo uma vez, para o seletor de item.
  useEffect(() => {
    fetch("/api/admin/aura-itens")
      .then((r) => r.json())
      .then((d: { items?: AuraItemAdmin[] }) => setItems(d.items ?? []))
      .catch(() => {})
  }, [])

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (itemId !== "all") p.set("itemId", itemId)
    if (kind !== "all") p.set("kind", kind)
    if (buyer) p.set("userId", buyer.id)
    return p.toString()
  }, [itemId, kind, buyer])

  // Mantém a URL sincronizada (compartilhável), sem recarregar a página.
  useEffect(() => {
    const url = queryString ? `/admin/aura-itens/compras?${queryString}` : "/admin/aura-itens/compras"
    router.replace(url, { scroll: false })
  }, [queryString, router])

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const p = new URLSearchParams(queryString)
      if (cursor) p.set("cursor", cursor)
      const res = await fetch(`/api/admin/aura-itens/purchases?${p.toString()}`)
      const data = (await res.json()) as {
        rows?: AuraPurchaseRow[]
        nextCursor?: string | null
        totals?: AuraPurchaseTotals
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      return data
    },
    [queryString]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPage(null)
      setRows(data.rows ?? [])
      setNextCursor(data.nextCursor ?? null)
      setTotals(data.totals ?? { grossAura: 0, purchases: 0, uniqueBuyers: 0 })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar histórico", { description: message })
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  useEffect(() => {
    load()
  }, [load])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(nextCursor)
      setRows((prev) => [...prev, ...(data.rows ?? [])])
      setNextCursor(data.nextCursor ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      toast.error("Erro ao carregar mais", { description: message })
    } finally {
      setLoadingMore(false)
    }
  }

  const hasFilters = itemId !== "all" || kind !== "all" || buyer !== null

  function clearFilters() {
    setItemId("all")
    setKind("all")
    setBuyer(null)
  }

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin/aura-itens" parentLabel="Itens de Aura" currentLabel="Histórico de compras" />

      {/* Stats — refletem o recorte filtrado */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Coins}
          label="Aura arrecadada"
          value={compact(totals.grossAura)}
          sub={hasFilters ? "no filtro atual" : "desde o início"}
          accent="bg-violet-500"
        />
        <StatCard
          icon={ShoppingBag}
          label="Compras"
          value={fmt(totals.purchases)}
          sub={hasFilters ? "no filtro atual" : "todas"}
          accent="bg-emerald-500"
        />
        <StatCard
          icon={Users}
          label="Compradores únicos"
          value={fmt(totals.uniqueBuyers)}
          accent="bg-sky-500"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3">
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="h-9 w-[220px] text-sm">
            <SelectValue placeholder="Item" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os itens</SelectItem>
            {items.map((it) => (
              <SelectItem key={it.id} value={it.id}>
                {it.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="avatar_frame">Moldura de avatar</SelectItem>
            <SelectItem value="vip_month">VIP</SelectItem>
            <SelectItem value="display_name_change">Troca de nome</SelectItem>
            <SelectItem value="streak_shield">Escudo de ofensiva</SelectItem>
            <SelectItem value="mini_profile_bg">Fundo de perfil</SelectItem>
            <SelectItem value="peripheral">Produto</SelectItem>
          </SelectContent>
        </Select>

        <UserFilter value={buyer} onChange={setBuyer} />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-muted-foreground">
            <X className="size-3.5" />
            Limpar filtros
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <BoxLoader />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Gem className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "Nenhuma compra com esses filtros." : "Nenhuma compra registrada ainda."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comprador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pago</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Carteira (antes → depois)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const meta = KIND_META[r.itemKind] ?? KIND_META.avatar_frame
                  const KindIcon = meta.icon
                  const discounted = r.vipDiscountApplied && r.amountPaid !== r.listPrice
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      {/* Comprador */}
                      <td className="px-4 py-3">
                        {r.buyer.displaySlug ? (
                          <Link
                            href={`/perfil/${r.buyer.displaySlug}`}
                            className="group flex items-center gap-2.5"
                          >
                            <UserAvatar name={r.buyer.displayName} avatarUrl={r.buyer.avatarUrl} size={8} />
                            <span className="text-sm font-medium text-foreground group-hover:underline">
                              {r.buyer.displayName}
                            </span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={r.buyer.displayName} avatarUrl={r.buyer.avatarUrl} size={8} />
                            <span className="text-sm font-medium text-foreground">{r.buyer.displayName}</span>
                          </div>
                        )}
                      </td>

                      {/* Item */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                              meta.className
                            )}
                          >
                            <KindIcon className="size-3" />
                            {meta.label}
                          </span>
                          <span className="text-sm text-foreground">{r.itemName}</span>
                          {r.itemId === null && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              excluído
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Pago */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {discounted && (
                            <span className="text-xs text-muted-foreground/60 line-through">{fmt(r.listPrice)}</span>
                          )}
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            🔥 {fmt(r.amountPaid)}
                          </span>
                          {discounted && (
                            <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-bold text-amber-300">
                              VIP −10%
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Carteira antes → depois */}
                      <td className="px-4 py-3 text-right">
                        {r.balanceBefore === null || r.balanceAfter === null ? (
                          <span className="text-xs text-muted-foreground/50" title="Compra anterior ao registro de saldo">
                            —
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                            <span className="text-muted-foreground">{fmt(r.balanceBefore)}</span>
                            <ArrowRight className="size-3 text-muted-foreground/50" />
                            <span className="font-medium text-foreground">{fmt(r.balanceAfter)}</span>
                          </span>
                        )}
                      </td>

                      {/* Quando */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className="text-xs text-muted-foreground"
                          title={new Date(r.createdAt).toLocaleString("pt-BR")}
                        >
                          {relativeTime(r.createdAt)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function AuraPurchasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <BoxLoader />
        </div>
      }
    >
      <PurchasesContent />
    </Suspense>
  )
}
