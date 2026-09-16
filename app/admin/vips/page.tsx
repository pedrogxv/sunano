"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  BadgeCheck,
  CreditCard,
  Crown,
  Gift,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import type {
  VipAdminFilter,
  VipAdminRow,
  VipAdminTotals,
} from "@/lib/server/repositories/vip-admin-repository"

// ── helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("pt-BR")
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

/** Dias restantes até a data — negativo quando já passou. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

const FILTERS: Array<{ key: VipAdminFilter; label: string }> = [
  { key: "active_vips", label: "VIPs ativos" },
  { key: "subscribers", label: "Assinantes" },
  { key: "past_due", label: "Em atraso" },
  { key: "pending", label: "Pagamento em aberto" },
  { key: "aura_or_manual", label: "Aura / manual" },
  { key: "canceled", label: "Cancelados" },
  { key: "all", label: "Todos" },
]

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  past_due: { label: "Em atraso", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  pending: { label: "Aguardando pagamento", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  canceled: { label: "Cancelada", className: "bg-muted text-muted-foreground border-border" },
  expired: { label: "Expirada", className: "bg-muted text-muted-foreground border-border" },
}

type UserHit = {
  id: string
  displayName: string
  displaySlug: string | null
  avatarUrl: string | null
}

// ── cartão de métrica ────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType
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
        <div className="flex size-9 items-center justify-center rounded-xl bg-foreground/5">
          <Icon className="size-4 text-foreground/80" />
        </div>
      </div>
    </div>
  )
}

// ── busca de usuário para conceder VIP ───────────────────────────────────

function UserPicker({ onPick }: { onPick: (user: UserHit) => void }) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<UserHit[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
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
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/vips?users=${encodeURIComponent(term)}`)
        const data = (await res.json()) as { users?: UserHit[] }
        if (!cancelled) setHits(data.users ?? [])
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar membro pelo nome…"
          className="h-9 pl-8 text-sm"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => {
                onPick(hit)
                setQuery("")
                setHits([])
                setOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <UserAvatar name={hit.displayName} avatarUrl={hit.avatarUrl} size={7} />
              <span className="truncate text-sm text-foreground">{hit.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── página ───────────────────────────────────────────────────────────────

function VipsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [filter, setFilter] = useState<VipAdminFilter>(
    (searchParams.get("filter") as VipAdminFilter) || "active_vips"
  )
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<VipAdminRow[]>([])
  const [totals, setTotals] = useState<VipAdminTotals | null>(null)
  // Só cosmético: o servidor rejeita a escrita de qualquer jeito (ver
  // `authorizeVipWrite`). Começa `false` para não piscar um botão proibido.
  const [canWrite, setCanWrite] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [grantTarget, setGrantTarget] = useState<UserHit | null>(null)
  const [grantMonths, setGrantMonths] = useState("1")
  const [busy, setBusy] = useState(false)

  usePageHeader("VIPs", "Assinaturas VIP: estado na Asaas, cobranças e concessão manual.")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Volta para a 1ª página sempre que o recorte muda — senão o admin fica
  // olhando uma página vazia de um conjunto que encolheu.
  useEffect(() => {
    setPage(1)
  }, [filter, debouncedSearch])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filter !== "active_vips") params.set("filter", filter)
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim())
    return params.toString()
  }, [filter, debouncedSearch])

  useEffect(() => {
    router.replace(queryString ? `/admin/vips?${queryString}` : "/admin/vips", { scroll: false })
  }, [queryString, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("filter", filter)
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      params.set("page", String(page))

      const res = await fetch(`/api/admin/vips?${params.toString()}`)
      const data = (await res.json()) as {
        rows?: VipAdminRow[]
        totals?: VipAdminTotals
        total?: number
        hasMore?: boolean
        canWrite?: boolean
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setRows(data.rows ?? [])
      setTotals(data.totals ?? null)
      setTotal(data.total ?? 0)
      setHasMore(Boolean(data.hasMore))
      setCanWrite(Boolean(data.canWrite))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar VIPs", { description: message })
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  async function grantVip() {
    if (!grantTarget) return
    setBusy(true)
    try {
      const body =
        grantMonths === "lifetime" ? { lifetime: true } : { months: Number(grantMonths) }
      const res = await fetch(`/api/admin/vips/${grantTarget.id}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string; expiresAt?: string | null }
      if (!res.ok) throw new Error(data.error ?? "Erro ao conceder")

      toast.success(`VIP concedido a ${grantTarget.displayName}`, {
        description:
          data.expiresAt === null
            ? "Sem data de expiração."
            : `Válido até ${formatDate(data.expiresAt ?? null)}.`,
      })
      setGrantTarget(null)
      setGrantMonths("1")
      await load()
    } catch (err) {
      toast.error("Não foi possível conceder", {
        description: err instanceof Error ? err.message : "Erro inesperado",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Crown}
          label="VIPs ativos"
          value={totals ? fmt(totals.activeVips) : "—"}
          sub="de todas as origens"
          accent="bg-amber-500"
        />
        <StatCard
          icon={BadgeCheck}
          label="Assinantes"
          value={totals ? fmt(totals.payingSubscribers) : "—"}
          sub={
            totals
              ? `${fmt(totals.pastDue)} em atraso · ${fmt(totals.yearlySubscribers)} no anual`
              : undefined
          }
          accent="bg-emerald-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Receita recorrente"
          value={totals ? formatBRL(totals.mrrCents) : "—"}
          // O anual entra rateado (preço ÷ 12), não pelo valor cheio: senão um
          // assinante anual apareceria no painel como dez mensais.
          sub="por mês, anual rateado"
          accent="bg-violet-500"
        />
        <StatCard
          icon={Gift}
          label="Aura / manual"
          value={totals ? fmt(totals.auraOrManual) : "—"}
          sub="VIP sem assinatura"
          accent="bg-sky-500"
        />
      </div>

      {/* Conceder VIP — só para quem pode escrever */}
      {canWrite && (
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Gift className="size-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground">Conceder VIP manualmente</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Estende a partir do VIP atual (nunca encurta) e não cria cobrança na Asaas.
        </p>
        <div className="max-w-sm">
          <UserPicker onPick={setGrantTarget} />
        </div>
      </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3">
        <Select value={filter} onValueChange={(value) => setFilter(value as VipAdminFilter)}>
          <SelectTrigger className="h-9 w-[210px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome…"
            className="h-9 w-[220px] pl-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-9 gap-1.5">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>

        <span className="ml-auto text-xs text-muted-foreground">
          {loading ? "carregando…" : `${fmt(total)} ${total === 1 ? "resultado" : "resultados"}`}
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <BoxLoader />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Crown className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum VIP neste recorte.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Membro</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assinatura</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">VIP até</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const status = row.subscription ? STATUS_META[row.subscription.status] : null
                  const remaining = daysUntil(row.vipExpiresAt)
                  return (
                    <tr key={row.userId} className="transition-colors hover:bg-muted/30">
                      {/* Membro */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={row.displayName} avatarUrl={row.avatarUrl} size={8} frame={row.frame} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {row.displayName}
                              {!row.vipActive && (
                                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                  sem VIP
                                </span>
                              )}
                            </p>
                            {row.email && (
                              <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Origem */}
                      <td className="px-4 py-3">
                        {row.origin === "subscription" ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                            {row.subscription?.paymentMethod === "pix" ? (
                              <QrCode className="size-3" />
                            ) : (
                              <CreditCard className="size-3" />
                            )}
                            {row.subscription?.paymentMethod === "pix" ? "PIX" : "Cartão"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                            <Gift className="size-3" />
                            Aura / manual
                          </span>
                        )}
                      </td>

                      {/* Assinatura */}
                      <td className="px-4 py-3">
                        {status ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={cn(
                                "inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                                status.className
                              )}
                            >
                              {status.label}
                            </span>
                            {row.subscription?.currentPeriodEnd && (
                              <span className="text-[11px] text-muted-foreground">
                                renova {formatDate(row.subscription.currentPeriodEnd)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* VIP até */}
                      <td className="px-4 py-3">
                        {row.vipExpiresAt === null ? (
                          <span className="inline-flex items-center gap-1 text-sm text-amber-400">
                            <Crown className="size-3.5" />
                            sem expiração
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm tabular-nums text-foreground">
                              {formatDate(row.vipExpiresAt)}
                            </span>
                            {remaining !== null && (
                              <span
                                className={cn(
                                  "text-[11px]",
                                  remaining < 0
                                    ? "text-muted-foreground"
                                    : remaining <= 7
                                      ? "text-amber-400"
                                      : "text-muted-foreground"
                                )}
                              >
                                {remaining < 0
                                  ? `venceu há ${Math.abs(remaining)} d`
                                  : `faltam ${remaining} d`}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm" className="h-8">
                          <Link href={`/admin/vips/${row.userId}`}>{canWrite ? "Gerenciar" : "Ver"}</Link>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(page > 1 || hasMore) && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">página {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      {/* Diálogo de concessão */}
      <Dialog
        open={grantTarget !== null}
        onOpenChange={(open) => {
          if (!open) setGrantTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conceder VIP</DialogTitle>
            <DialogDescription>
              {grantTarget && (
                <>
                  O acesso de <strong className="text-foreground">{grantTarget.displayName}</strong> será
                  estendido a partir do VIP que ele já tem. Nenhuma cobrança é criada na Asaas.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Duração</label>
            <Select value={grantMonths} onValueChange={setGrantMonths}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mês</SelectItem>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="lifetime">Sem expiração</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantTarget(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={grantVip} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
              Conceder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AdminVipsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <BoxLoader />
        </div>
      }
    >
      <VipsContent />
    </Suspense>
  )
}
