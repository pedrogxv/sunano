"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { GripVertical, Loader2, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { sortTiers, tierGradientStyle, tierTextColor } from "@/lib/personal-tierlist-theme"
import { TierManager } from "./TierManager"
import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

type SearchResult = {
  id: string
  name: string
  image_url: string | null
  brand?: string | null
}

/** Sugestões mostradas antes de digitar qualquer coisa, para a busca não abrir vazia. */
const INITIAL_SUGGESTION_LIMIT = 6

/**
 * Editor da tierlist pessoal (VIP).
 *
 * Três decisões que moldam o componente:
 *
 * 1. **Escritas otimistas.** O estado muda na hora e a requisição corre atrás;
 *    se falhar, desfaz e avisa. Antes cada clique esperava o round-trip
 *    completo (auth → perfil → upsert) antes de mexer na tela — o que dava a
 *    impressão de que a interface tinha travado.
 * 2. **Drag and drop**, com a mesma mecânica do board admin (`@dnd-kit`,
 *    PointerSensor com 8px de ativação, `DragOverlay` seguindo o cursor).
 *    O `<select>` de tier saiu junto: arrastar substitui, e o gesto de clicar
 *    para mover continua disponível pelos botões coloridos da busca.
 * 3. **Busca sempre povoada.** Ao focar já mostra sugestões, em vez de um
 *    painel vazio que só reagia a partir do segundo caractere.
 */
export function PersonalTierlistEditor({
  initialItems,
  initialTiers,
}: {
  initialItems: TierlistItem[]
  initialTiers: TierlistTierDef[]
}) {
  const [items, setItems] = useState<TierlistItem[]>(initialItems)
  const [tiers, setTiers] = useState<TierlistTierDef[]>(sortTiers(initialTiers))
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)

  const searchBoxRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Mesma folga do board admin: sem ela, um clique no botão de remover
      // vira um micro-drag e o clique se perde.
      activationConstraint: { distance: 8 },
    })
  )

  // Busca: com menos de 2 caracteres mostra sugestões (lista inicial) em vez de
  // devolver um painel vazio; a partir daí filtra de verdade, com debounce.
  useEffect(() => {
    const trimmed = query.trim()
    const isSuggestions = trimmed.length < 2

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams(
          isSuggestions
            ? { limit: String(INITIAL_SUGGESTION_LIMIT) }
            : { search: trimmed, limit: "8" }
        )
        fetch(`/api/peripherals?${params.toString()}`)
          .then((res) => res.json())
          .then((json: { peripherals?: SearchResult[] }) => {
            if (!cancelled) setResults(json.peripherals ?? [])
          })
          .catch(() => {
            if (!cancelled) setResults([])
          })
          .finally(() => {
            if (!cancelled) setSearching(false)
          })
      },
      isSuggestions ? 0 : 300
    )

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  // Fecha o painel ao clicar fora — ele agora abre no foco, então precisa de
  // uma saída que não seja "apagar o texto".
  useEffect(() => {
    if (!searchOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!searchBoxRef.current?.contains(event.target as Node)) setSearchOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [searchOpen])

  const existingIds = useMemo(() => new Set(items.map((i) => i.peripheralId)), [items])
  const activeItem = activeId ? items.find((i) => i.peripheralId === activeId) ?? null : null
  const itemCountByTierId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.tierId, (counts.get(item.tierId) ?? 0) + 1)
    return counts
  }, [items])

  /** Envia a mudança e desfaz o estado local se o servidor recusar. */
  async function persist(body: unknown, method: "POST" | "DELETE", rollback: () => void, fallbackMessage: string) {
    setPendingCount((count) => count + 1)
    try {
      const res = await fetch("/api/perfil/tierlist", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? fallbackMessage)
      }
    } catch (err) {
      rollback()
      toast.error(err instanceof Error ? err.message : fallbackMessage)
    } finally {
      setPendingCount((count) => count - 1)
    }
  }

  function addItem(peripheral: SearchResult, tierId: string) {
    if (existingIds.has(peripheral.id)) return

    const position = items.filter((i) => i.tierId === tierId).length
    const optimistic: TierlistItem = {
      peripheralId: peripheral.id,
      tierId,
      position,
      peripheral: {
        id: peripheral.id,
        name: peripheral.name,
        brandName: peripheral.brand ?? null,
        category: "",
        imageUrl: peripheral.image_url,
        // A busca pública devolve só o essencial (`SHORT_COLUMNS`): tier
        // oficial, tags e notas chegam no próximo carregamento. O board de
        // edição não usa o hover com esses dados, então nada falta aqui.
        siteTier: null,
        tags: [],
        ratings: {},
      },
    }

    setItems((prev) => [...prev, optimistic])
    setQuery("")
    setSearchOpen(false)

    void persist(
      { peripheralId: peripheral.id, tierId, position },
      "POST",
      () => setItems((prev) => prev.filter((i) => i.peripheralId !== peripheral.id)),
      "Não foi possível adicionar o item."
    )
  }

  function moveItem(peripheralId: string, tierId: string) {
    const previous = items
    const current = items.find((i) => i.peripheralId === peripheralId)
    if (!current || current.tierId === tierId) return

    const position = items.filter((i) => i.tierId === tierId).length
    setItems((prev) => prev.map((i) => (i.peripheralId === peripheralId ? { ...i, tierId, position } : i)))

    void persist(
      { peripheralId, tierId, position },
      "POST",
      () => setItems(previous),
      "Não foi possível mover o item."
    )
  }

  function removeItem(peripheralId: string) {
    const previous = items
    setItems((prev) => prev.filter((i) => i.peripheralId !== peripheralId))

    void persist(
      { peripheralId },
      "DELETE",
      () => setItems(previous),
      "Não foi possível remover o item."
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const targetTierId = over.id.toString()
    if (!tiers.some((t) => t.id === targetTierId)) return
    moveItem(active.id.toString(), targetTierId)
  }

  return (
    <div className="space-y-4">
      <div ref={searchBoxRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="Buscar periférico para adicionar..."
            className="pl-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* `bg-popover` (opaco) e não `CARD_SURFACE`: aquele é `bg-secondary/50`,
            pensado para um card no fluxo da página — como painel sobreposto ele
            deixava o board aparecer por baixo. Mesma receita dos outros popovers
            do projeto (dropdown-menu/select): opaco, ring sutil e z-[70]. */}
        {searchOpen && (
          <div className="absolute inset-x-0 top-full z-[70] mt-2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10">
            <p className="border-b border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {query.trim().length < 2 ? "Sugestões" : "Resultados"}
              <span className="ml-1.5 font-normal normal-case tracking-normal">
                — escolha o tier para adicionar
              </span>
            </p>

            <div className="max-h-72 overflow-y-auto">
              {searching && results.length === 0 ? (
                <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Buscando...
                </p>
              ) : results.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Nenhum periférico encontrado.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {results.map((p) => {
                    const already = existingIds.has(p.id)
                    return (
                      <li
                        key={p.id}
                        className={cn("flex items-center gap-3 p-2", already && "opacity-50")}
                      >
                        <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-[var(--card-image-bg)]">
                          {p.image_url && (
                            <Image src={p.image_url} alt={p.name} fill sizes="36px" className="object-contain p-0.5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">{p.name}</p>
                          {p.brand && <p className="truncate text-[11px] text-muted-foreground">{p.brand}</p>}
                        </div>

                        {already ? (
                          <span className="shrink-0 text-xs text-muted-foreground">já adicionado</span>
                        ) : (
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            {tiers.map((tier) => (
                              <button
                                key={tier.id}
                                type="button"
                                title={`Adicionar no tier ${tier.label}`}
                                onClick={() => addItem(p, tier.id)}
                                style={{ backgroundColor: tier.color, color: tierTextColor(tier.color) }}
                                className="flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-[11px] font-black transition-transform hover:scale-110"
                              >
                                {tier.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <TierManager tiers={tiers} itemCountByTierId={itemCountByTierId} onTiersChange={setTiers} />

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>Arraste os periféricos entre os tiers para reordenar.</p>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Salvando...
          </span>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(event: DragStartEvent) => setActiveId(event.active.id.toString())}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        {/* Board de edição: todas as linhas sempre visíveis (inclusive as vazias),
            para o tier ser um alvo estável de drop. */}
        <div className={cn("relative overflow-hidden rounded-xl border shadow-lg", CARD_SURFACE)}>
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.07),_transparent_60%)]" />

          <div className="divide-y divide-border">
            {tiers.map((tier) => (
              <TierDropRow
                key={tier.id}
                tier={tier}
                items={items.filter((i) => i.tierId === tier.id)}
                onRemove={removeItem}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem ? <DragGhost item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      {items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Busque um periférico acima para começar sua tierlist.
        </p>
      )}
    </div>
  )
}

/** Uma linha de tier que aceita drop — o id do droppable é a própria letra do tier. */
function TierDropRow({
  tier,
  items,
  onRemove,
}: {
  tier: TierlistTierDef
  items: TierlistItem[]
  onRemove: (peripheralId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier.id })
  const textColor = tierTextColor(tier.color)

  return (
    <div className="flex items-stretch">
      <div
        style={tierGradientStyle(tier.color)}
        className="flex w-16 shrink-0 flex-col items-center justify-center px-2 sm:w-20"
      >
        <span
          className="line-clamp-2 break-words text-center text-base font-black leading-tight"
          style={{ color: textColor }}
        >
          {tier.label}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "relative min-w-0 flex-1 bg-muted/20 p-2 transition-colors",
          isOver && "bg-cyan-500/[0.06]"
        )}
      >
        {isOver && <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-cyan-400/50" />}

        {items.length === 0 ? (
          <div className="flex min-h-[52px] items-center justify-center">
            <span className="text-[11px] text-muted-foreground/50">
              {isOver ? "Soltar aqui" : "Nenhum periférico neste tier"}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <DraggableItemChip key={item.peripheralId} item={item} tier={tier} onRemove={onRemove} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableItemChip({
  item,
  tier,
  onRemove,
}: {
  item: TierlistItem
  tier: TierlistTierDef
  onRemove: (peripheralId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.peripheralId })

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1, borderColor: `${tier.color}40` }}
      className="group flex cursor-grab items-center gap-2 rounded-lg border bg-black/40 py-1.5 pl-1.5 pr-1.5 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />

      <div className="relative size-8 shrink-0 overflow-hidden rounded bg-[var(--card-image-bg)]">
        {item.peripheral.imageUrl && (
          <Image
            src={item.peripheral.imageUrl}
            alt={item.peripheral.name}
            fill
            sizes="32px"
            className="object-contain p-0.5"
          />
        )}
      </div>

      <span className="max-w-32 truncate text-xs font-medium text-foreground">{item.peripheral.name}</span>

      {/* `onPointerDown` com stopPropagation: sem isso o sensor de drag engole o
          clique e o botão de remover nunca dispara. */}
      <button
        type="button"
        aria-label={`Remover ${item.peripheral.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(item.peripheralId)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

/** Card flutuante que segue o cursor durante o arraste. */
function DragGhost({ item }: { item: TierlistItem }) {
  return (
    <div className="flex rotate-2 scale-105 cursor-grabbing items-center gap-2 rounded-lg border border-cyan-400/50 bg-secondary/90 py-1.5 pl-1.5 pr-2.5 drop-shadow-2xl ring-2 ring-cyan-400/20">
      <div className="relative size-8 shrink-0 overflow-hidden rounded bg-[var(--card-image-bg)]">
        {item.peripheral.imageUrl && (
          <Image
            src={item.peripheral.imageUrl}
            alt={item.peripheral.name}
            fill
            sizes="32px"
            className="object-contain p-0.5"
          />
        )}
      </div>
      <span className="max-w-32 truncate text-xs font-medium text-foreground">{item.peripheral.name}</span>
    </div>
  )
}
