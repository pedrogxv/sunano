"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { restrictToParentElement } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertTriangle, CalendarClock, GripVertical, Package, ShoppingBag, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { StoreProductPicker } from "@/components/admin/StoreProductPicker"
import { CampaignHeader } from "@/components/store/campaign/CampaignHeader"
import { ProductCard } from "@/components/store/ProductCard"
import { ConfirmDialog } from "@/components/ui/adaptive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RouteLink } from "@/components/ui/route-link"
import { fromLocalInput, toLocalInput } from "@/lib/datetime-local"
import { formatBRL } from "@/lib/format"
import type { AdminStoreCampaignDetail } from "@/lib/server/repositories/store-campaigns-repository"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"
import { storageImgProps } from "@/lib/storage-thumb"
import {
  STORE_CAMPAIGN_MAX_PRODUCTS,
  STORE_CAMPAIGN_STATUS_LABEL,
  STORE_CAMPAIGN_SUBTITLE_MAX,
  STORE_CAMPAIGN_THEME,
  STORE_CAMPAIGN_THEMES,
  STORE_CAMPAIGN_TITLE_MAX,
  storeCampaignStatus,
  type StoreCampaignTheme,
} from "@/lib/store-campaigns"
import { cn } from "@/lib/utils"

type FormState = {
  theme: StoreCampaignTheme
  title: string
  subtitle: string
  startsAt: string
  endsAt: string
  isEnabled: boolean
  products: StoreProductCard[]
}

function emptyForm(): FormState {
  const theme: StoreCampaignTheme = "black_friday"
  return {
    theme,
    title: STORE_CAMPAIGN_THEME[theme].defaultTitle,
    subtitle: STORE_CAMPAIGN_THEME[theme].defaultSubtitle,
    startsAt: "",
    endsAt: "",
    isEnabled: true,
    products: [],
  }
}

function toForm(campaign: AdminStoreCampaignDetail): FormState {
  return {
    theme: campaign.theme,
    title: campaign.title,
    subtitle: campaign.subtitle ?? "",
    startsAt: toLocalInput(campaign.startsAt),
    endsAt: toLocalInput(campaign.endsAt),
    isEnabled: campaign.isEnabled,
    products: campaign.products,
  }
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-emerald-500" : "bg-muted-foreground/30")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  )
}

function SortableProduct({
  product,
  position,
  onRemove,
}: {
  product: StoreProductCard
  position: number
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id })
  const paused = !product.is_active

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group flex h-[54px] items-center gap-2.5 rounded-lg border border-border bg-card px-2",
        isDragging && "z-10 border-white/25 shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar ${product.name}`}
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-amber-400">{position}</span>
      <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...storageImgProps(product.images[0], 36)} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Package className="size-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{product.name}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {formatBRL(product.promo_price_cents ?? product.price_cents)}
          {product.promo_price_cents == null && <span className="text-amber-400/80">sem preço promocional</span>}
          {paused && <span className="text-red-400">pausado, não aparece</span>}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
        aria-label={`Tirar ${product.name} da campanha`}
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  )
}

/**
 * Editor de uma campanha sazonal da Loja (criar e editar). Tudo é salvo de
 * uma vez: textos, período, tema e a lista de produtos na ordem.
 */
export function StoreCampaignEditor({ campaignId }: { campaignId: string | null }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(campaignId ? null : emptyForm)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    if (!campaignId) return
    let active = true
    fetch(`/api/admin/store-campaigns/${campaignId}`)
      .then(async (res) => {
        const data = (await res.json()) as { campaign?: AdminStoreCampaignDetail; error?: string }
        if (!res.ok || !data.campaign) throw new Error(data.error ?? "Erro ao carregar a campanha.")
        if (active) setForm(toForm(data.campaign))
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Erro ao carregar a campanha.")
      })
    return () => {
      active = false
    }
  }, [campaignId])

  // Situação da campanha AGORA, para o selo da prévia.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const startsIso = form ? fromLocalInput(form.startsAt) : null
  const endsIso = form ? fromLocalInput(form.endsAt) : null
  const status = useMemo(
    () => (form && startsIso && endsIso ? storeCampaignStatus({ startsAt: startsIso, endsAt: endsIso, isEnabled: form.isEnabled }, now) : null),
    [form, startsIso, endsIso, now]
  )

  if (loadError) {
    return (
      <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        <p>{loadError}</p>
        <Button asChild variant="outline" size="sm">
          <RouteLink href="/admin/store/campanhas">Voltar para as campanhas</RouteLink>
        </Button>
      </div>
    )
  }
  if (!form) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
  }

  const patch = (next: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...next } : prev))

  /** Troca de tema leva junto os textos padrão, a menos que o admin já tenha escrito os dele. */
  function pickTheme(theme: StoreCampaignTheme) {
    if (!form) return
    const previous = STORE_CAMPAIGN_THEME[form.theme]
    const next = STORE_CAMPAIGN_THEME[theme]
    patch({
      theme,
      title: !form.title.trim() || form.title === previous.defaultTitle ? next.defaultTitle : form.title,
      subtitle: !form.subtitle.trim() || form.subtitle === previous.defaultSubtitle ? next.defaultSubtitle : form.subtitle,
    })
  }

  function addProduct(product: StoreProductCard | null) {
    if (!form || !product) return
    if (form.products.some((p) => p.id === product.id)) {
      toast.info(`${product.name} já está na campanha.`)
      return
    }
    if (form.products.length >= STORE_CAMPAIGN_MAX_PRODUCTS) {
      toast.error(`No máximo ${STORE_CAMPAIGN_MAX_PRODUCTS} produtos por campanha.`)
      return
    }
    patch({ products: [...form.products, product] })
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!form) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = form.products.findIndex((p) => p.id === active.id)
    const to = form.products.findIndex((p) => p.id === over.id)
    if (from === -1 || to === -1) return
    patch({ products: arrayMove(form.products, from, to) })
  }

  async function handleSave() {
    if (!form) return
    if (!form.title.trim()) return void toast.error("Dê um título para a campanha.")
    if (!startsIso || !endsIso) return void toast.error("Preencha quando a campanha começa e termina.")
    if (Date.parse(endsIso) <= Date.parse(startsIso)) return void toast.error("O fim precisa ser depois do início.")

    setSaving(true)
    try {
      const res = await fetch(campaignId ? `/api/admin/store-campaigns/${campaignId}` : "/api/admin/store-campaigns", {
        method: campaignId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: form.theme,
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || null,
          startsAt: startsIso,
          endsAt: endsIso,
          isEnabled: form.isEnabled,
          productIds: form.products.map((p) => p.id),
        }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? "Erro ao salvar a campanha.")
      toast.success("Campanha salva", { description: "A Loja já mostra a versão nova." })
      if (!campaignId) router.replace(`/admin/store/campanhas/${data.id}`)
    } catch (err) {
      toast.error("Erro ao salvar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/admin/store-campaigns/${campaignId}`, { method: "DELETE" })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    // Lançar mantém o ConfirmDialog aberto com o erro à vista.
    if (!res.ok) throw new Error(data.error ?? "Erro ao apagar a campanha.")
    toast.success("Campanha apagada")
    router.replace("/admin/store/campanhas")
  }

  const theme = STORE_CAMPAIGN_THEME[form.theme]
  const activeProducts = form.products.filter((p) => p.is_active)

  return (
    <div className="space-y-6">
      {/* Prévia: o mesmo componente da vitrine. */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Prévia</h2>
          {status && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                status === "live" && "bg-emerald-500/10 text-emerald-400",
                status === "scheduled" && "bg-sky-500/10 text-sky-400",
                (status === "ended" || status === "disabled") && "bg-slate-500/10 text-muted-foreground"
              )}
            >
              {STORE_CAMPAIGN_STATUS_LABEL[status]}
            </span>
          )}
        </div>
        <div data-campaign-theme={form.theme} className="space-y-3 rounded-xl border border-border bg-background p-3 sm:p-4">
          <CampaignHeader
            theme={form.theme}
            title={form.title.trim() || theme.defaultTitle}
            subtitle={form.subtitle.trim() || null}
            endsAt={endsIso ?? new Date(now + 3 * 86_400_000).toISOString()}
          />
          {activeProducts.length > 0 && (
            <div className="pointer-events-none grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
              {activeProducts.slice(0, 4).map((product) => (
                <ProductCard key={product.id} {...product} skin="campaign" />
              ))}
            </div>
          )}
        </div>
        {activeProducts.length === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <AlertTriangle className="size-3.5" />
            Sem produto ativo, a campanha não aparece na Loja, mesmo ligada e dentro do período.
          </p>
        )}
      </section>

      {/* Tema */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Tema</h2>
          <p className="text-[11px] text-muted-foreground">Cores, ícones e efeito do cabeçalho e dos cards.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STORE_CAMPAIGN_THEMES.map((key) => {
            const option = STORE_CAMPAIGN_THEME[key]
            const selected = form.theme === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => pickTheme(key)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  selected ? "border-foreground/40 bg-muted" : "border-border hover:border-foreground/20"
                )}
              >
                <span className={cn("size-9 shrink-0 rounded-md", option.swatch)} />
                <span>
                  <span className="block text-[13px] font-semibold text-foreground">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{option.effectLabel}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Textos e período */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Campanha ligada</h2>
            <p className="text-[11px] text-muted-foreground">
              Desligada, não aparece nem dentro do período. Só pode haver uma ligada por período.
            </p>
          </div>
          <Switch checked={form.isEnabled} onChange={(isEnabled) => patch({ isEnabled })} label="Campanha ligada" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="campaign-title">Título</Label>
            <Input
              id="campaign-title"
              maxLength={STORE_CAMPAIGN_TITLE_MAX}
              value={form.title}
              placeholder={theme.defaultTitle}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-subtitle">Subtítulo, opcional</Label>
            <Input
              id="campaign-subtitle"
              maxLength={STORE_CAMPAIGN_SUBTITLE_MAX}
              value={form.subtitle}
              placeholder={theme.defaultSubtitle}
              onChange={(event) => patch({ subtitle: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            Período
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="campaign-starts" className="text-[11px] text-muted-foreground">
                Começa
              </Label>
              <Input
                id="campaign-starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => patch({ startsAt: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="campaign-ends" className="text-[11px] text-muted-foreground">
                Termina
              </Label>
              <Input
                id="campaign-ends"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => patch({ endsAt: event.target.value })}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O contador da Loja corre até o fim. Fora do período a seção some sozinha, sem precisar desligar.
          </p>
        </div>
      </section>

      {/* Produtos */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ShoppingBag className="size-4" />
              Produtos da campanha
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Aparecem nesta ordem (arraste para trocar). O preço exibido é o do produto: a promoção é o preço
              promocional cadastrado nele.
            </p>
          </div>
          <span className="text-xs font-bold tabular-nums text-muted-foreground">
            {form.products.length}/{STORE_CAMPAIGN_MAX_PRODUCTS}
          </span>
        </div>

        <StoreProductPicker value={null} onChange={addProduct} placeholder="Buscar produto para adicionar…" />

        {form.products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhum produto ainda. Busque acima para adicionar.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToParentElement]} onDragEnd={handleDragEnd}>
            <SortableContext items={form.products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-1.5">
                {form.products.map((product, index) => (
                  <SortableProduct
                    key={product.id}
                    product={product}
                    position={index + 1}
                    onRemove={() => patch({ products: form.products.filter((p) => p.id !== product.id) })}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {campaignId ? (
          <Button type="button" variant="ghost" className="gap-1.5 text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" />
            Apagar campanha
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <RouteLink href="/admin/store/campanhas">Voltar</RouteLink>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : campaignId ? "Salvar campanha" : "Criar campanha"}
          </Button>
        </div>
      </div>

      {campaignId && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Apagar esta campanha?"
          description="Ela sai da Loja na hora e não dá para desfazer. Para só tirar do ar, desligue em vez de apagar."
          confirmLabel="Apagar"
          destructive
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
