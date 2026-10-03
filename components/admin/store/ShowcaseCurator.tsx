"use client"

import { useState } from "react"
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { restrictToParentElement } from "@dnd-kit/modifiers"
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertTriangle, GripVertical, Loader2, Package, Plus, Star, TrendingUp, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/format"
import { STORE_SHOWCASE_SLOTS } from "@/lib/store-showcase"
import { cn } from "@/lib/utils"

export type ShowcaseProduct = {
  id: string
  name: string
  images: string[]
  price_cents: number
  promo_price_cents: number | null
}

export type ShowcaseKey = "featured" | "bestSellers"

export type ShowcaseList = {
  items: ShowcaseProduct[]
  loading: boolean
  reordering: boolean
  /** Recebe a lista inteira já reordenada (vagas + excedentes, nessa ordem). */
  onReorder: (ids: string[]) => void
  onRemove: (product: ShowcaseProduct) => void
  /** Tira de uma vez tudo o que passou das vagas. */
  onTrimOverflow: (products: ShowcaseProduct[]) => void
}

const META: Record<
  ShowcaseKey,
  {
    label: string
    icon: LucideIcon
    /** Cor da aba ativa, do medidor e do número da vaga. */
    accent: string
    pip: string
    where: string
    howToAdd: string
    removeLabel: string
  }
> = {
  featured: {
    label: "Destaques",
    icon: Star,
    accent: "text-amber-400",
    pip: "bg-amber-400",
    where: "Selecionados da semana, no topo da Loja, nesta ordem.",
    howToAdd: "pela estrela na lista abaixo",
    removeLabel: "Remover dos Destaques",
  },
  bestSellers: {
    label: "Mais vendidos",
    icon: TrendingUp,
    accent: "text-emerald-400",
    pip: "bg-emerald-400",
    where: "Na frente do ranking de vendas da seção Mais vendidos, nesta ordem.",
    howToAdd: "pelo ícone de tendência na lista abaixo",
    removeLabel: "Desfixar de Mais vendidos",
  },
}

/** Medidor de vagas: um traço por vaga, aceso quando ocupada. */
function SlotMeter({ used, pip }: { used: number; pip: string }) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: STORE_SHOWCASE_SLOTS }, (_, i) => (
        <span
          key={i}
          className={cn("h-2.5 w-1 rounded-full transition-colors", i < used ? pip : "bg-white/10")}
        />
      ))}
    </span>
  )
}

function ProductThumb({ product }: { product: ShowcaseProduct }) {
  return (
    <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
      {product.images[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.images[0]} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Package className="size-4" />
        </div>
      )}
    </div>
  )
}

function SortableSlot({
  product,
  position,
  accent,
  removeLabel,
  onRemove,
  busy,
}: {
  product: ShowcaseProduct
  position: number
  accent: string
  removeLabel: string
  onRemove: () => void
  busy: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group flex h-[54px] items-center gap-2.5 rounded-lg border border-border bg-card px-2 transition-colors",
        isDragging && "z-10 border-white/25 shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar ${product.name}`}
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className={cn("w-4 shrink-0 text-center text-sm font-black tabular-nums", accent)}>{position}</span>
      <ProductThumb product={product} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{product.name}</p>
        <p className="text-[11px] text-muted-foreground">{formatBRL(product.promo_price_cents ?? product.price_cents)}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
        aria-label={removeLabel}
        title={removeLabel}
        disabled={busy}
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  )
}

/**
 * Curadoria manual da Loja ("Destaques" e "Mais vendidos") num painel só,
 * com abas: as duas listas abertas uma embaixo da outra empurravam a
 * tabela de produtos para fora da tela. Cada lista tem
 * `STORE_SHOWCASE_SLOTS` vagas desenhadas, vazias inclusive, para o limite
 * ser visto antes de ser esbarrado. O que passou do limite (marcado antes
 * da trava existir) fica numa faixa à parte: a Loja não o exibe.
 */
export function ShowcaseCurator({
  lists,
  busyId,
}: {
  lists: Record<ShowcaseKey, ShowcaseList>
  busyId: string | null
}) {
  const [tab, setTab] = useState<ShowcaseKey>("featured")
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const list = lists[tab]
  const meta = META[tab]
  const slotted = list.items.slice(0, STORE_SHOWCASE_SLOTS)
  const overflow = list.items.slice(STORE_SHOWCASE_SLOTS)
  const freeSlots = STORE_SHOWCASE_SLOTS - slotted.length

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = slotted.findIndex((p) => p.id === active.id)
    const to = slotted.findIndex((p) => p.id === over.id)
    if (from === -1 || to === -1) return
    list.onReorder([...arrayMove(slotted, from, to), ...overflow].map((p) => p.id))
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/50 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Vitrines da Loja" className="flex rounded-lg border border-border bg-background/60 p-0.5">
          {(Object.keys(META) as ShowcaseKey[]).map((key) => {
            const m = META[key]
            const Icon = m.icon
            const active = key === tab
            const used = Math.min(lists[key].items.length, STORE_SHOWCASE_SLOTS)
            const over = lists[key].items.length > STORE_SHOWCASE_SLOTS
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-3.5", active && m.accent, active && key === "featured" && "fill-current")} />
                {m.label}
                {lists[key].loading ? (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <SlotMeter used={used} pip={active ? m.pip : "bg-muted-foreground/60"} />
                    {over && <AlertTriangle className="size-3 text-amber-400" aria-label="Acima do limite" />}
                  </>
                )}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className={cn("font-bold tabular-nums", meta.accent)}>
            {slotted.length}/{STORE_SHOWCASE_SLOTS}
          </span>{" "}
          vagas · {meta.where}
        </p>
      </div>

      {list.loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToParentElement]} onDragEnd={handleDragEnd}>
            <SortableContext items={slotted.map((p) => p.id)} strategy={rectSortingStrategy}>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {slotted.map((product, index) => (
                  <SortableSlot
                    key={product.id}
                    product={product}
                    position={index + 1}
                    accent={meta.accent}
                    removeLabel={meta.removeLabel}
                    onRemove={() => list.onRemove(product)}
                    busy={list.reordering || busyId === product.id}
                  />
                ))}
                {Array.from({ length: freeSlots }, (_, i) => (
                  <li
                    key={`free-${i}`}
                    className="flex h-[54px] items-center gap-2.5 rounded-lg border border-dashed border-white/10 px-2 text-muted-foreground/60"
                  >
                    <span className="w-[22px]" />
                    <span className="w-4 shrink-0 text-center text-sm font-black tabular-nums">{slotted.length + i + 1}</span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-white/10">
                      <Plus className="size-3.5" />
                    </span>
                    <span className="text-[11px] leading-tight">
                      Vaga livre
                      {i === 0 && <span className="block text-muted-foreground/50">Adicione {meta.howToAdd}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </SortableContext>
          </DndContext>

          {overflow.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs text-amber-300">
                  <AlertTriangle className="size-3.5" />
                  {overflow.length === 1 ? "1 produto ficou" : `${overflow.length} produtos ficaram`} fora das{" "}
                  {STORE_SHOWCASE_SLOTS} vagas e não aparece{overflow.length === 1 ? "" : "m"} na Loja.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-500/40 text-xs text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                  disabled={list.reordering || busyId !== null}
                  onClick={() => list.onTrimOverflow(overflow)}
                >
                  Remover {overflow.length === 1 ? "o excedente" : `os ${overflow.length} excedentes`}
                </Button>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {overflow.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card py-0.5 pr-0.5 pl-2 text-[11px] text-muted-foreground"
                  >
                    {product.name}
                    <button
                      type="button"
                      onClick={() => list.onRemove(product)}
                      disabled={busyId === product.id}
                      className="rounded p-0.5 hover:bg-white/10 hover:text-foreground"
                      aria-label={meta.removeLabel}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground/70">
                Para trazer um deles para dentro, libere uma vaga e ele sobe sozinho.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
