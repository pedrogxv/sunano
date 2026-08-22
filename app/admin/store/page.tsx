"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Edit,
  Loader2,
  MessageSquare,
  MoreVertical,
  Package,
  Plus,
  Search,
  Star,
  Store,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { MultiCombobox } from "@/components/ui/combobox"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"

interface StoreProduct {
  id: string
  slug: string
  name: string
  price_cents: number
  promo_price_cents: number | null
  stock: number | null
  images: string[]
  category: string | null
  brand: string | null
  condition: "new" | "used" | "opened"
  is_active: boolean
  is_sold_out: boolean
  is_featured: boolean
  has_variants: boolean
  created_at: string
}

interface ProductDetail {
  product: {
    id: string
    description: string | null
    brand: string | null
  }
  specs: { id: string; label: string; value: string }[]
  variants: { id: string; label: string }[]
  peripheralIds: string[]
}

/** Converte texto em BRL ("29,90" / "R$ 29,90") pra centavos. Retorna null se inválido. */
function parseBRLToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Emb. aberta",
  used: "Usado",
}

const CONDITION_COLOR: Record<string, string> = {
  new: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  opened: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  used: "text-orange-400 bg-orange-500/10 border-orange-500/30",
}

const PAGE_SIZE = 50

const NO_CATEGORY_KEY = "__sem_categoria__"

/** Deriva o título do grupo a partir do valor de categoria salvo no produto — sem lista estática de labels. */
function formatCategoryLabel(key: string): string {
  if (key === NO_CATEGORY_KEY) return "Sem categoria"
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function AdminStorePage() {
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outOfStockOnly, setOutOfStockOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 400)
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [brandFilter, setBrandFilter] = useState<string[]>([])
  // Opções dos combobox vêm de todos os produtos já vistos nesta sessão (não só
  // a página atual), pra não sumir uma marca/categoria ao trocar de filtro.
  const [knownCategories, setKnownCategories] = useState<Set<string>>(new Set())
  const [knownBrands, setKnownBrands] = useState<Set<string>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  // Detalhe do produto (specs/variantes/descrição) — só buscado quando o
  // admin abre o dropdown daquela linha pela primeira vez, e cacheado aqui
  // pra não rebater na API se reabrir. Mantém a listagem principal leve.
  const [detailCache, setDetailCache] = useState<Record<string, ProductDetail>>({})
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [promoDraft, setPromoDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (outOfStockOnly) params.set("outOfStock", "1")
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      if (categoryFilter.length > 0) params.set("categories", categoryFilter.join(","))
      if (brandFilter.length > 0) params.set("brands", brandFilter.join(","))
      const res = await fetch(`/api/admin/store/products?${params}`)
      const data = (await res.json()) as { products?: StoreProduct[]; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setProducts(data.products ?? [])
      setTotal(data.total ?? 0)
      setKnownCategories((prev) => {
        const next = new Set(prev)
        for (const p of data.products ?? []) if (p.category) next.add(p.category)
        return next
      })
      setKnownBrands((prev) => {
        const next = new Set(prev)
        for (const p of data.products ?? []) if (p.brand) next.add(p.brand)
        return next
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar produtos", { description: message })
    } finally {
      setLoading(false)
    }
  }, [page, outOfStockOnly, debouncedSearch, categoryFilter, brandFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(1) }, [outOfStockOnly, debouncedSearch, categoryFilter, brandFilter])

  async function handleDelete() {
    if (!deleteDialog.id) return
    const target = products.find((p) => p.id === deleteDialog.id)
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/store/products/${deleteDialog.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      setProducts((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
      toast.success("Produto deletado", { description: target?.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao deletar"
      setError(message)
      toast.error("Erro ao deletar produto", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  async function loadDetail(id: string) {
    if (detailCache[id] || loadingDetailId === id) return
    setLoadingDetailId(id)
    try {
      const res = await fetch(`/api/admin/store/products/${id}`)
      const data = (await res.json()) as ProductDetail & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar detalhes")
      setDetailCache((prev) => ({ ...prev, [id]: data }))
    } catch (err) {
      toast.error("Erro ao carregar detalhes do produto", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoadingDetailId(null)
    }
  }

  async function patchProduct(id: string, patch: Record<string, unknown>) {
    const previous = products.find((p) => p.id === id)
    if (!previous) return
    // Atualização otimista — evita recarregar a listagem inteira a cada ação rápida.
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/store/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as { product?: StoreProduct; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar")
      return true
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === id ? previous : p)))
      toast.error("Erro ao salvar alteração", {
        description: err instanceof Error ? err.message : undefined,
      })
      return false
    } finally {
      setSavingId(null)
    }
  }

  async function toggleFeatured(product: StoreProduct) {
    const ok = await patchProduct(product.id, { is_featured: !product.is_featured })
    if (ok) {
      toast.success(!product.is_featured ? "Produto marcado como destaque" : "Destaque removido", {
        description: product.name,
      })
    }
  }

  async function toggleActive(product: StoreProduct) {
    await patchProduct(product.id, { is_active: !product.is_active })
  }

  async function toggleSoldOut(product: StoreProduct) {
    await patchProduct(product.id, { is_sold_out: !product.is_sold_out })
  }

  async function applyPromoPrice(product: StoreProduct) {
    const raw = promoDraft[product.id] ?? ""
    if (raw.trim() === "") {
      const ok = await patchProduct(product.id, { promo_price_cents: null })
      if (ok) toast.success("Preço promocional removido", { description: product.name })
      return
    }
    const cents = parseBRLToCents(raw)
    if (cents === null) {
      toast.error("Preço promocional inválido")
      return
    }
    if (cents >= product.price_cents) {
      toast.error("Preço promocional deve ser menor que o preço base.")
      return
    }
    const ok = await patchProduct(product.id, { promo_price_cents: cents })
    if (ok) toast.success("Preço promocional aplicado", { description: product.name })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // O filtro "sem estoque" já é aplicado no banco (query `outOfStockOnly`),
  // então `products` chega pronto — sem filtro adicional em memória.
  const visibleProducts = products
  const categoryOptions = [...knownCategories].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }))
  const brandOptions = [...knownBrands].sort((a, b) => a.localeCompare(b)).map((b) => ({ value: b, label: b }))

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, StoreProduct[]>()
    for (const p of visibleProducts) {
      const key = p.category ?? NO_CATEGORY_KEY
      const list = groups.get(key)
      if (list) list.push(p)
      else groups.set(key, [p])
    }
    return [...groups.entries()].sort((a, b) =>
      a[0] === NO_CATEGORY_KEY ? 1 : b[0] === NO_CATEGORY_KEY ? -1 : formatCategoryLabel(a[0]).localeCompare(formatCategoryLabel(b[0]))
    )
  }, [visibleProducts])

  usePageHeader("Loja", "Gerencie os produtos da loja.")

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end">
        <div className="flex gap-2">
          <Link href="/admin/store/new">
            <Button className="gap-2 border-border">
              <Plus className="size-4" />
              Novo produto
            </Button>
          </Link>
        </div>
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou marca..."
            className="h-9 border-border bg-card pl-9 text-[13px]"
            aria-label="Buscar produtos"
          />
        </div>
        <MultiCombobox
          options={categoryOptions}
          values={categoryFilter}
          onValuesChange={setCategoryFilter}
          placeholder="Categoria"
          searchPlaceholder="Buscar categoria"
          allLabel="Todas as categorias"
          className="h-9 w-auto min-w-[150px] border-border bg-card text-[13px] font-normal"
        />
        <MultiCombobox
          options={brandOptions}
          values={brandFilter}
          onValuesChange={setBrandFilter}
          placeholder="Marca"
          searchPlaceholder="Buscar marca"
          allLabel="Todas as marcas"
          className="h-9 w-auto min-w-[150px] border-border bg-card text-[13px] font-normal"
        />
        <button
          type="button"
          onClick={() => setOutOfStockOnly((prev) => !prev)}
          aria-pressed={outOfStockOnly}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors",
            outOfStockOnly
              ? "border-red-400/40 bg-red-500/10 text-red-400"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <AlertTriangle className="size-3.5" />
          Sem estoque
        </button>
        {(search.trim() || categoryFilter.length > 0 || brandFilter.length > 0 || outOfStockOnly) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("")
              setCategoryFilter([])
              setBrandFilter([])
              setOutOfStockOnly(false)
            }}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Products table */}
      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : products.length === 0 && outOfStockOnly ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-16 text-center">
          <AlertTriangle className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhum produto sem estoque</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Store className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum produto cadastrado</p>
          <Link href="/admin/store/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Criar produto
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedProducts.map(([categoryKey, categoryProducts]) => (
          <div key={categoryKey} className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">{formatCategoryLabel(categoryKey)}</h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Condição</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preço</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estoque</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
              {categoryProducts.map((p) => {
                const detail = detailCache[p.id]
                const isLoadingDetail = loadingDetailId === p.id
                const isSaving = savingId === p.id
                const hasDiscount = p.promo_price_cents != null && p.promo_price_cents < p.price_cents

                return (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {p.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-0.5" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground">{p.name}</p>
                            {p.is_featured && (
                              <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                            )}
                          </div>
                          {p.category && (
                            <p className="text-[10px] text-muted-foreground">{p.category}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        CONDITION_COLOR[p.condition]
                      )}>
                        {CONDITION_LABEL[p.condition]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {hasDiscount ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-emerald-400 text-sm">{formatBRL(p.promo_price_cents as number)}</span>
                          <span className="text-[10px] text-muted-foreground line-through">{formatBRL(p.price_cents)}</span>
                        </div>
                      ) : (
                        <span className="font-semibold text-emerald-400 text-sm">{formatBRL(p.price_cents)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        p.stock === 0
                          ? "bg-red-500/15 text-red-400"
                          : p.stock !== null && p.stock <= 3
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-muted text-foreground/80"
                      )}>
                        {p.stock === null ? "Disponível" : p.stock === 0 ? "Esgotado" : `${p.stock} un.`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px]",
                          !p.is_active
                            ? "bg-slate-500/10 text-muted-foreground"
                            : p.is_sold_out
                              ? "bg-red-500/10 text-red-400"
                              : "bg-emerald-500/10 text-emerald-400"
                        )}
                      >
                        {!p.is_active ? "Inativo" : p.is_sold_out ? "Esgotado" : "Ativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "size-8",
                            p.is_featured ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-foreground"
                          )}
                          title={p.is_featured ? "Remover destaque" : "Marcar como destaque"}
                          disabled={isSaving}
                          onClick={() => toggleFeatured(p)}
                        >
                          <Star className={cn("size-3.5", p.is_featured && "fill-current")} />
                        </Button>
                        <Link href={`/admin/store/${p.id}`}>
                          <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
                            <Edit className="size-3.5" />
                          </Button>
                        </Link>
                        <DropdownMenu onOpenChange={(open) => { if (open) loadDetail(p.id) }}>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-80 p-3">
                            {isLoadingDetail ? (
                              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                Carregando detalhes...
                              </div>
                            ) : detail ? (
                              <div className="space-y-1.5 pb-2">
                                {detail.product.brand && (
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">Marca:</span> {detail.product.brand}
                                  </p>
                                )}
                                {detail.product.description && (
                                  <p className="line-clamp-3 text-xs text-muted-foreground">{detail.product.description}</p>
                                )}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground/80">
                                    <Package className="size-3" />
                                    {detail.specs.length} specs
                                  </span>
                                  {p.has_variants && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground/80">
                                      {detail.variants.length} variantes
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            <DropdownMenuSeparator />

                            {/* Ações rápidas — editam direto na linha, sem abrir o form completo */}
                            <div className="space-y-2.5 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">Destaque na loja</span>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => toggleFeatured(p)}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                    p.is_featured
                                      ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                                      : "border-border bg-muted text-muted-foreground"
                                  )}
                                >
                                  <Star className={cn("size-3", p.is_featured && "fill-current")} />
                                  {p.is_featured ? "Ativo" : "Inativo"}
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">Produto ativo</span>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => toggleActive(p)}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                    p.is_active
                                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                                      : "border-border bg-muted text-muted-foreground"
                                  )}
                                >
                                  {p.is_active ? <Check className="size-3" /> : <X className="size-3" />}
                                  {p.is_active ? "Ativo" : "Inativo"}
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">Esgotado</span>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => toggleSoldOut(p)}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                    p.is_sold_out
                                      ? "border-red-400/40 bg-red-400/10 text-red-400"
                                      : "border-border bg-muted text-muted-foreground"
                                  )}
                                >
                                  {p.is_sold_out ? "Sim" : "Não"}
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                <span className="text-xs font-semibold text-foreground">Preço promocional</span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={p.promo_price_cents ? formatBRL(p.promo_price_cents) : "Sem desconto"}
                                    defaultValue={p.promo_price_cents ? String(p.promo_price_cents / 100).replace(".", ",") : ""}
                                    onChange={(e) => setPromoDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                    disabled={isSaving}
                                    className="h-7 w-full rounded-md border border-border bg-muted/30 px-2 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isSaving}
                                    onClick={() => applyPromoPrice(p)}
                                    className="h-7 shrink-0 px-2 text-[11px]"
                                  >
                                    Aplicar
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem asChild>
                              <Link href={`/admin/store/${p.id}/reviews`} className="flex items-center gap-2">
                                <MessageSquare className="size-3.5" />
                                Resenhas
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/store/${p.id}`} className="flex items-center gap-2">
                                <Edit className="size-3.5" />
                                Editar produto completo
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2 text-red-400 focus:text-red-400"
                              onClick={() => setDeleteDialog({ open: true, id: p.id })}
                            >
                              <Trash2 className="size-3.5" />
                              Deletar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
                </tbody>
              </table>
            </div>
          </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Próxima
          </Button>
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Deletar produto?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
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
