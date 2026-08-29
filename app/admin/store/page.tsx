"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Edit,
  GripVertical,
  Loader2,
  MessageSquare,
  MoreVertical,
  Package,
  Plus,
  Search,
  Star,
  Store,
  Trash2,
  TrendingUp,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  sale_type: "pre_order" | "ready_stock" | "normal"
  is_active: boolean
  is_sold_out: boolean
  is_featured: boolean
  pin_best_seller: boolean
  best_seller_position: number | null
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

type SaleType = "pre_order" | "ready_stock" | "normal"

const SALE_TYPE_LABEL: Record<SaleType, string> = {
  normal: "Normal",
  pre_order: "🚀 Pré-venda",
  ready_stock: "📦 Pronta entrega",
}

const SALE_TYPE_FILTER_OPTIONS: { value: "all" | SaleType; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "ready_stock", label: "📦 Pronta entrega" },
  { value: "pre_order", label: "🚀 Pré-venda" },
  { value: "normal", label: "Normal" },
]

const SALE_TYPE_BADGE_COLOR: Record<SaleType, string> = {
  normal: "",
  pre_order: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  ready_stock: "bg-sky-500/10 text-sky-400 border-sky-500/30",
}

const PAGE_SIZE = 50

const NO_CATEGORY_KEY = "__sem_categoria__"

type SortOption = "name-asc" | "name-desc" | "price-asc" | "price-desc" | "recent"

const SORT_LABEL: Record<SortOption, string> = {
  "name-asc": "Nome (A-Z)",
  "name-desc": "Nome (Z-A)",
  "price-asc": "Preço (menor)",
  "price-desc": "Preço (maior)",
  recent: "Mais recentes",
}

/** Deriva o título do grupo a partir do valor de categoria salvo no produto — sem lista estática de labels. */
function formatCategoryLabel(key: string): string {
  if (key === NO_CATEGORY_KEY) return "Sem categoria"
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ────────────────────────────────────────────
// Linha arrastável do painel "Mais vendidos — ordem manual"
// ────────────────────────────────────────────
function SortablePinnedRow({
  product,
  position,
  onUnpin,
  isBusy,
}: {
  product: StoreProduct
  position: number
  onUnpin: (product: StoreProduct) => void
  isBusy: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors",
        isDragging && "z-10 border-primary/40 shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar ${product.name}`}
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{position}</span>

      <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0]} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Package className="size-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
        <p className="text-xs text-muted-foreground">{formatBRL(product.promo_price_cents ?? product.price_cents)}</p>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Desfixar de Mais vendidos"
        title="Desfixar de Mais vendidos"
        disabled={isBusy}
        onClick={() => onUnpin(product)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
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
  const [saleTypeFilter, setSaleTypeFilter] = useState<"all" | SaleType>("all")
  const [sort, setSort] = useState<SortOption>("name-asc")
  // Opções dos combobox vêm de todos os produtos já vistos nesta sessão (não só
  // a página atual), pra não sumir uma marca/categoria ao trocar de filtro.
  const [knownCategories, setKnownCategories] = useState<Set<string>>(new Set())
  const [knownBrands, setKnownBrands] = useState<Set<string>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  // Painel "Mais vendidos — ordem manual": lista à parte dos produtos
  // fixados, carregada independente da tabela paginada/filtrada abaixo, pra
  // sempre mostrar todos os fixados (mesmo os que a busca/filtro atual esconde).
  const [pinnedProducts, setPinnedProducts] = useState<StoreProduct[]>([])
  const [loadingPinned, setLoadingPinned] = useState(true)
  const [reorderingPinned, setReorderingPinned] = useState(false)
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

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
      if (saleTypeFilter !== "all") params.set("saleTypes", saleTypeFilter)
      params.set("sort", sort)
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
  }, [page, outOfStockOnly, debouncedSearch, categoryFilter, brandFilter, saleTypeFilter, sort])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(1) }, [outOfStockOnly, debouncedSearch, categoryFilter, brandFilter, saleTypeFilter, sort])

  const loadPinned = useCallback(async () => {
    setLoadingPinned(true)
    try {
      const res = await fetch("/api/admin/store/products?pinnedBestSellers=1&pageSize=100")
      const data = (await res.json()) as { products?: StoreProduct[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setPinnedProducts(data.products ?? [])
    } catch (err) {
      toast.error("Erro ao carregar produtos fixados", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoadingPinned(false)
    }
  }, [])

  useEffect(() => { loadPinned() }, [loadPinned])

  async function handlePinnedDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = pinnedProducts.findIndex((p) => p.id === active.id)
    const newIndex = pinnedProducts.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = pinnedProducts
    const reordered = arrayMove(pinnedProducts, oldIndex, newIndex)
    setPinnedProducts(reordered)
    setReorderingPinned(true)
    try {
      const res = await fetch("/api/admin/store/products/reorder-best-sellers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((p) => p.id) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao reordenar.")
      }
    } catch (err) {
      setPinnedProducts(previous)
      toast.error("Não foi possível reordenar", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setReorderingPinned(false)
    }
  }

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
    // Atualização otimista só quando o produto está na tabela visível — o
    // painel "Mais vendidos" chama isso também pra produtos fora da
    // página/filtro atual, e o PATCH precisa disparar do mesmo jeito.
    if (previous) setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
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
      if (previous) setProducts((prev) => prev.map((p) => (p.id === id ? previous : p)))
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

  async function togglePinBestSeller(product: StoreProduct) {
    const ok = await patchProduct(product.id, { pin_best_seller: !product.pin_best_seller })
    if (ok) {
      toast.success(
        !product.pin_best_seller ? "Produto fixado em Mais vendidos" : "Removido de Mais vendidos",
        { description: product.name }
      )
      loadPinned()
    }
  }

  async function toggleActive(product: StoreProduct) {
    await patchProduct(product.id, { is_active: !product.is_active })
  }

  async function toggleSoldOut(product: StoreProduct) {
    await patchProduct(product.id, { is_sold_out: !product.is_sold_out })
  }

  async function setSaleType(product: StoreProduct, saleType: SaleType) {
    if (product.sale_type === saleType) return
    const ok = await patchProduct(product.id, { sale_type: saleType })
    if (ok) toast.success(`Marcado como "${SALE_TYPE_LABEL[saleType]}"`, { description: product.name })
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

      {/* Mais vendidos — ordem manual */}
      <div className="space-y-2.5 rounded-xl border border-border bg-card/50 p-3.5">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-emerald-400" />
          <p className="text-sm font-semibold text-foreground">Mais vendidos — ordem manual</p>
          <p className="text-xs text-muted-foreground">
            {pinnedProducts.length > 0
              ? "Arraste pra reordenar. Aparecem na Home nessa ordem, à frente do ranking de vendas."
              : "Fixe um produto pelo ícone de tendência na lista abaixo pra ele aparecer aqui."}
          </p>
        </div>
        {loadingPinned ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : pinnedProducts.length > 0 ? (
          <DndContext
            sensors={dragSensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handlePinnedDragEnd}
          >
            <SortableContext items={pinnedProducts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {pinnedProducts.map((p, index) => (
                  <SortablePinnedRow
                    key={p.id}
                    product={p}
                    position={index + 1}
                    onUnpin={togglePinBestSeller}
                    isBusy={reorderingPinned || savingId === p.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : null}
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
        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="h-9 w-auto min-w-[150px] border-border bg-card text-[13px] font-normal" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortOption[]).map((option) => (
              <SelectItem key={option} value={option}>
                {SORT_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={saleTypeFilter} onValueChange={(v) => setSaleTypeFilter(v as "all" | SaleType)}>
          <SelectTrigger className="h-9 w-auto min-w-[150px] border-border bg-card text-[13px] font-normal" aria-label="Filtrar por tipo de venda">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SALE_TYPE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search.trim() || categoryFilter.length > 0 || brandFilter.length > 0 || saleTypeFilter !== "all" || outOfStockOnly) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("")
              setCategoryFilter([])
              setBrandFilter([])
              setSaleTypeFilter("all")
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
                            {p.pin_best_seller && (
                              <TrendingUp className="size-3.5 shrink-0 text-emerald-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {p.category && (
                              <p className="text-[10px] text-muted-foreground">{p.category}</p>
                            )}
                            {p.sale_type !== "normal" && (
                              <span className={cn(
                                "rounded-full border px-1.5 py-0 text-[9px] font-semibold",
                                SALE_TYPE_BADGE_COLOR[p.sale_type]
                              )}>
                                {SALE_TYPE_LABEL[p.sale_type]}
                              </span>
                            )}
                          </div>
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
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "size-8",
                            p.pin_best_seller ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-foreground"
                          )}
                          title={p.pin_best_seller ? "Remover de Mais vendidos" : "Fixar em Mais vendidos"}
                          disabled={isSaving}
                          onClick={() => togglePinBestSeller(p)}
                        >
                          <TrendingUp className="size-3.5" />
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

                              <div className="space-y-1.5">
                                <span className="text-xs font-semibold text-foreground">Tipo de venda</span>
                                <div className="flex flex-wrap gap-1">
                                  {(Object.keys(SALE_TYPE_LABEL) as SaleType[]).map((type) => (
                                    <button
                                      key={type}
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => setSaleType(p, type)}
                                      className={cn(
                                        "rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors",
                                        p.sale_type === type
                                          ? type === "normal"
                                            ? "border-foreground/40 bg-foreground/10 text-foreground"
                                            : SALE_TYPE_BADGE_COLOR[type]
                                          : "border-border bg-muted text-muted-foreground"
                                      )}
                                    >
                                      {SALE_TYPE_LABEL[type]}
                                    </button>
                                  ))}
                                </div>
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
