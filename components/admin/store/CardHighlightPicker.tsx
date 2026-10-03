"use client"

import { useEffect, useMemo, useState } from "react"
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { restrictToParentElement } from "@dnd-kit/modifiers"
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Database, GripVertical, Loader2, Pin, Plus, RotateCcw, Sparkles, X } from "lucide-react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  CARD_HIGHLIGHT_MAX_CHARS,
  CARD_HIGHLIGHTS_MAX,
  type CardHighlightOption,
  type CardHighlightVocabulary,
} from "@/lib/store-card"
import { cn } from "@/lib/utils"

/** Mesmo chip do card da vitrine (`CardHighlights` em ProductCard): o admin vê o que o cliente vai ver. */
const CHIP_CLASS =
  "flex h-[22px] items-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.04] px-1.5 text-[10.5px] font-semibold text-[#cfcfcf]"

function usesLabel(option: CardHighlightOption): string {
  const total = option.manualUses + option.autoUses
  return `${total} ${total === 1 ? "produto" : "produtos"}`
}

function SortableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: label })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(CHIP_CLASS, "gap-1 pr-0.5 pl-0.5", isDragging && "z-10 border-white/30 bg-white/10")}
    >
      <button
        type="button"
        className="cursor-grab text-[#7a7a7a] hover:text-white active:cursor-grabbing"
        aria-label={`Reordenar ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3" />
      </button>
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-[#7a7a7a] hover:bg-white/10 hover:text-white"
        aria-label={`Remover ${label}`}
      >
        <X className="size-3" />
      </button>
    </li>
  )
}

/**
 * "Características no card" do formulário de produto: busca no vocabulário
 * que a vitrine já usa (escolhas manuais + o automático do Database, ver
 * `getCardHighlightVocabulary`) e cria o termo quando ele não existe. A
 * ordem dos chips é a do card, e o card corta o que não cabe numa linha,
 * então arrastar decide o que some primeiro.
 *
 * Lista vazia = automático: em vez de três campos em branco, mostra o que o
 * card vai exibir sozinho, com atalho para fixar e ajustar a partir dali.
 */
export function CardHighlightPicker({
  productId,
  value,
  onChange,
}: {
  /** Produto já salvo; sem ele não há sugestão do Database. */
  productId: string | null
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [vocabulary, setVocabulary] = useState<CardHighlightVocabulary>({ options: [], suggested: [] })
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    const controller = new AbortController()
    const params = productId ? `?${new URLSearchParams({ product_id: productId })}` : ""
    fetch(`/api/admin/store/card-highlights${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CardHighlightVocabulary | null) => {
        if (data) setVocabulary(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [productId])

  const selectedKeys = useMemo(() => new Set(value.map((label) => label.toLowerCase())), [value])
  const full = value.length >= CARD_HIGHLIGHTS_MAX
  const term = search.replace(/\s+/g, " ").trim()
  const tooLong = term.length > CARD_HIGHLIGHT_MAX_CHARS

  const suggested = vocabulary.suggested.filter((label) => !selectedKeys.has(label.toLowerCase()))
  const suggestedKeys = new Set(vocabulary.suggested.map((label) => label.toLowerCase()))
  const used = vocabulary.options.filter(
    (option) => !selectedKeys.has(option.label.toLowerCase()) && !suggestedKeys.has(option.label.toLowerCase())
  )
  const exists =
    selectedKeys.has(term.toLowerCase()) ||
    vocabulary.options.some((option) => option.label.toLowerCase() === term.toLowerCase()) ||
    suggestedKeys.has(term.toLowerCase())

  function add(label: string) {
    const clean = label.replace(/\s+/g, " ").trim()
    if (!clean || clean.length > CARD_HIGHLIGHT_MAX_CHARS || selectedKeys.has(clean.toLowerCase()) || full) return
    const next = [...value, clean]
    onChange(next)
    setSearch("")
    if (next.length >= CARD_HIGHLIGHTS_MAX) setOpen(false)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onChange(arrayMove(value, value.indexOf(String(active.id)), value.indexOf(String(over.id))))
  }

  const adder = (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={full}
          className="flex h-[22px] items-center gap-1 rounded-md border border-dashed border-white/20 px-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-white/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-3" />
          {full ? `Máximo de ${CARD_HIGHLIGHTS_MAX}` : "Adicionar"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 flex-col gap-0 p-0">
        <Command>
          <CommandInput
            placeholder="Buscar ou criar característica…"
            value={search}
            onValueChange={setSearch}
            maxLength={CARD_HIGHLIGHT_MAX_CHARS + 10}
          />
          {term && (
            <p className={cn("px-3 pt-1 text-right text-[10px] tabular-nums", tooLong ? "text-red-400" : "text-muted-foreground/70")}>
              {term.length}/{CARD_HIGHLIGHT_MAX_CHARS}
            </p>
          )}
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <CommandEmpty>{term ? "Nada com esse nome." : "Nenhuma característica cadastrada ainda."}</CommandEmpty>
            )}

            {term && !exists && (
              <CommandGroup>
                <CommandItem value={`__create__${term}`} disabled={tooLong} onSelect={() => add(term)}>
                  <Plus className="text-emerald-400" />
                  <span className="truncate">
                    {tooLong ? `Até ${CARD_HIGHLIGHT_MAX_CHARS} caracteres` : <>Criar &ldquo;{term}&rdquo;</>}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {!loading && suggested.length > 0 && (
              <CommandGroup heading="Sugeridas pelo Database para este produto">
                {suggested.map((label) => (
                  <CommandItem key={label} value={label} onSelect={() => add(label)}>
                    <Sparkles className="text-violet-400" />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!loading && used.length > 0 && (
              <CommandGroup heading="Já usadas na loja">
                {used.map((option) => (
                  <CommandItem key={option.label} value={option.label} onSelect={() => add(option.label)}>
                    {option.manualUses > 0 ? (
                      <Pin className="text-sky-400" aria-label="Escolhida à mão" />
                    ) : (
                      <Database className="text-muted-foreground" aria-label="Do automático" />
                    )}
                    <span className="truncate">{option.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">{usesLabel(option)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )

  if (value.length === 0) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/10 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Sparkles className="size-3.5 text-violet-400" />
            Automático
          </span>
          {vocabulary.suggested.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(vocabulary.suggested.slice(0, CARD_HIGHLIGHTS_MAX))}
              className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            >
              <Pin className="size-3" />
              Fixar e editar
            </button>
          )}
        </div>
        <ul className="flex min-h-[22px] flex-wrap items-center gap-1" aria-label="Características no card">
          {loading ? (
            <li className="text-[10.5px] text-muted-foreground/70">Carregando…</li>
          ) : vocabulary.suggested.length > 0 ? (
            vocabulary.suggested.map((label) => (
              <li key={label} className={cn(CHIP_CLASS, "opacity-60")}>
                {label}
              </li>
            ))
          ) : (
            <li className="text-[10.5px] text-muted-foreground/70">
              {productId ? "O Database não tem dado para este produto: o card sai sem características." : "Sugestões do Database aparecem depois de salvar."}
            </li>
          )}
          <li>{adder}</li>
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Pin className="size-3.5 text-sky-400" />
          Escolhidas à mão · {value.length}/{CARD_HIGHLIGHTS_MAX}
        </span>
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
        >
          <RotateCcw className="size-3" />
          Voltar ao automático
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToParentElement]} onDragEnd={handleDragEnd}>
        <SortableContext items={value} strategy={horizontalListSortingStrategy}>
          <ul className="flex flex-wrap items-center gap-1" aria-label="Características no card">
            {value.map((label) => (
              <SortableChip key={label} label={label} onRemove={() => onChange(value.filter((item) => item !== label))} />
            ))}
            {!full && <li>{adder}</li>}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
