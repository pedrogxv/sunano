"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Flame, PackageCheck, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import type { StoreFacetCounts } from "@/lib/server/repositories/store-repository"

export type StoreSortKey = "recent" | "name-asc" | "name-desc" | "price-asc" | "price-desc"

export const STORE_SORT_LABEL: Record<StoreSortKey, string> = {
  recent: "Mais recentes",
  "name-asc": "Nome A-Z",
  "name-desc": "Nome Z-A",
  "price-asc": "Menor preço",
  "price-desc": "Maior preço",
}

/**
 * Tudo que o cliente pode recortar no catálogo. `price` em reais (não centavos)
 * porque é o que o slider manipula; `null` = faixa inteira, sem filtro.
 */
export type StoreFilterState = {
  query: string
  categories: string[]
  brands: string[]
  conditions: string[]
  saleTypes: string[]
  price: [number, number] | null
  promoOnly: boolean
  inStockOnly: boolean
}

export const EMPTY_STORE_FILTERS: StoreFilterState = {
  query: "",
  categories: [],
  brands: [],
  conditions: [],
  saleTypes: [],
  price: null,
  promoOnly: false,
  inStockOnly: false,
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Emb. aberta",
  used: "Usado",
}

/** `normal` não vira opção: significa "sem marcação", não uma escolha de entrega. */
const SALE_TYPE_LABEL: Record<string, string> = {
  ready_stock: "Pronta entrega",
  pre_order: "Pré-venda",
}

/** Chip da fileira de filtros do desktop (36 px, #141414 sobre #0a0a0a). */
export const TRIGGER_CLASS =
  "flex h-9 w-auto items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-[#2a2a2a] bg-[#141414] px-3.5 text-[12.5px] font-semibold text-[#cfcfcf] transition-colors hover:border-foreground/25"

/** Mesmo chip, empilhado e de largura cheia dentro do popover do mobile. */
export const MOBILE_TRIGGER_CLASS =
  "flex h-11 w-full items-center justify-between gap-[7px] whitespace-nowrap rounded-xl border border-[#2a2a2a] bg-[#141414] px-4 text-[13px] font-semibold text-[#cfcfcf]"

const ACTIVE_TRIGGER_CLASS = "border-emerald-500/45 bg-emerald-500/10 text-white"

/** Cortes "redondos" pras faixas de preço — nada de R$ 1.237. */
const NICE_CUTS = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000]

function niceCut(value: number): number {
  return NICE_CUTS.find((cut) => cut >= value) ?? Math.ceil(value / 1000) * 1000
}

function formatShortBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR")}`
}

/**
 * Faixas prontas ("Até R$ 200", "R$ 200 – R$ 500"...) derivadas do preço máximo
 * do recorte atual. Clicar numa faixa é muito mais rápido do que mirar dois
 * polegares de slider, que é o que existia antes.
 */
export function buildPriceBands(maxPrice: number): { label: string; min: number; max: number }[] {
  if (maxPrice <= 0) return []
  const cuts = [...new Set([0.25, 0.5, 0.75].map((ratio) => niceCut(maxPrice * ratio)))]
    .filter((cut) => cut > 0 && cut < maxPrice)
    .sort((a, b) => a - b)
  if (cuts.length === 0) return []

  const bands = [{ label: `Até ${formatShortBRL(cuts[0])}`, min: 0, max: cuts[0] }]
  for (let i = 1; i < cuts.length; i++) {
    bands.push({ label: `${formatShortBRL(cuts[i - 1])} – ${formatShortBRL(cuts[i])}`, min: cuts[i - 1], max: cuts[i] })
  }
  bands.push({ label: `Acima de ${formatShortBRL(cuts[cuts.length - 1])}`, min: cuts[cuts.length - 1], max: maxPrice })
  return bands
}

export function countActiveFilters(state: StoreFilterState, lockedCategory: string | null, lockedBrand: string | null): number {
  return (
    (state.query.trim() ? 1 : 0) +
    state.categories.filter((c) => c !== lockedCategory).length +
    state.brands.filter((b) => b !== lockedBrand).length +
    state.conditions.length +
    state.saleTypes.length +
    (state.price ? 1 : 0) +
    (state.promoOnly ? 1 : 0) +
    (state.inStockOnly ? 1 : 0)
  )
}

interface FacetOption {
  value: string
  label: string
  count: number
}

/** Lista de checkboxes com contagem — a contagem é o que evita filtro que zera a grade. */
function FacetPopover({
  label,
  options,
  values,
  onValuesChange,
  triggerClass,
  searchable = false,
  searchPlaceholder = "Buscar",
}: {
  label: string
  options: FacetOption[]
  values: string[]
  onValuesChange: (values: string[]) => void
  triggerClass: string
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [search, setSearch] = useState("")
  const term = search.trim().toLowerCase()
  const visible = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options

  if (options.length === 0) return null

  const selectedLabels = values
    .map((v) => options.find((o) => o.value === v)?.label ?? v)
  const triggerLabel =
    selectedLabels.length === 0
      ? label
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels[0]} +${selectedLabels.length - 1}`

  const toggle = (value: string) => {
    onValuesChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(triggerClass, values.length > 0 && ACTIVE_TRIGGER_CLASS)}>
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className={cn("size-[13px] shrink-0", values.length > 0 ? "text-emerald-400" : "text-[#6e6e6e]")} strokeWidth={2.2} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[248px] flex-col gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-[#242424] px-3 py-2">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#7a7a7a]">{label}</span>
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onValuesChange([])}
              className="text-[11px] font-bold text-[#8a8a8a] transition-colors hover:text-white"
            >
              Limpar
            </button>
          )}
        </div>
        {searchable && options.length > 7 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="border-b border-[#242424] bg-transparent px-3 py-2.5 text-[12.5px] text-white outline-none placeholder:text-[#5e5e5e]"
          />
        )}
        <div className="max-h-[264px] overflow-y-auto p-1.5">
          {visible.length === 0 && <p className="px-2 py-3 text-[12.5px] text-[#6e6e6e]">Nada encontrado.</p>}
          {visible.map((option) => {
            const checked = values.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left transition-colors hover:bg-white/5"
              >
                <span
                  className={cn(
                    "flex size-[15px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                    checked ? "border-emerald-500 bg-emerald-500" : "border-[#3a3a3a]"
                  )}
                >
                  {checked && <Check className="size-[11px] text-[#04140d]" strokeWidth={3.4} />}
                </span>
                <span className="flex-1 truncate text-[12.5px] font-medium text-[#dcdcdc]">{option.label}</span>
                <span className="text-[11px] tabular-nums text-[#6e6e6e]">{option.count}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PricePopover({
  value,
  onChange,
  maxPrice,
  triggerClass,
}: {
  value: [number, number] | null
  onChange: (value: [number, number] | null) => void
  maxPrice: number
  triggerClass: string
}) {
  const bands = useMemo(() => buildPriceBands(maxPrice), [maxPrice])
  const current: [number, number] = value ?? [0, maxPrice]
  const activeBand = value ? bands.find((b) => b.min === value[0] && b.max === value[1]) : undefined
  const triggerLabel = !value
    ? "Preço"
    : activeBand
      ? activeBand.label
      : `${formatShortBRL(value[0])} – ${formatShortBRL(value[1])}`

  const commit = (next: [number, number]) => {
    const min = Math.max(0, Math.min(next[0], next[1]))
    const max = Math.min(maxPrice, Math.max(next[0], next[1]))
    onChange(min <= 0 && max >= maxPrice ? null : [min, max])
  }

  if (maxPrice <= 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(triggerClass, value && ACTIVE_TRIGGER_CLASS)}>
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className={cn("size-[13px] shrink-0", value ? "text-emerald-400" : "text-[#6e6e6e]")} strokeWidth={2.2} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] flex-col gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-[#242424] px-3 py-2">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#7a7a7a]">Preço</span>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] font-bold text-[#8a8a8a] transition-colors hover:text-white"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 p-3">
          {bands.map((band) => {
            const active = value?.[0] === band.min && value?.[1] === band.max
            return (
              <button
                key={band.label}
                type="button"
                onClick={() => (active ? onChange(null) : commit([band.min, band.max]))}
                className={cn(
                  "rounded-full border px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors",
                  active
                    ? "border-emerald-500/45 bg-emerald-500/10 text-white"
                    : "border-[#2a2a2a] bg-[#141414] text-[#b4b4b4] hover:border-foreground/25 hover:text-white"
                )}
              >
                {band.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#242424] p-3">
          <Slider
            min={0}
            max={maxPrice}
            step={10}
            value={current}
            onValueChange={([min, max]) => commit([min, max])}
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5">
              <span className="text-[11px] text-[#6e6e6e]">Mín</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={maxPrice}
                value={current[0]}
                onChange={(e) => commit([Number(e.target.value) || 0, current[1]])}
                className="w-full min-w-0 bg-transparent text-[12.5px] font-semibold text-white outline-none"
              />
            </label>
            <span className="text-[#4a4a4a]">–</span>
            <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5">
              <span className="text-[11px] text-[#6e6e6e]">Máx</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={maxPrice}
                value={current[1]}
                onChange={(e) => commit([current[0], Number(e.target.value) || 0])}
                className="w-full min-w-0 bg-transparent text-[12.5px] font-semibold text-white outline-none"
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ToggleChip({
  label,
  count,
  active,
  onClick,
  icon: Icon,
  triggerClass,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  triggerClass: string
}) {
  if (count === 0) return null
  return (
    <button type="button" onClick={onClick} className={cn(triggerClass, active && ACTIVE_TRIGGER_CLASS)}>
      <Icon className={cn("size-[13px] shrink-0", active ? "text-emerald-400" : "text-[#6e6e6e]")} strokeWidth={2.2} />
      <span className="truncate">{label}</span>
      <span className={cn("text-[11px] tabular-nums", active ? "text-emerald-400/80" : "text-[#6e6e6e]")}>{count}</span>
    </button>
  )
}

interface StoreFiltersProps {
  state: StoreFilterState
  onChange: (patch: Partial<StoreFilterState>) => void
  onReset: () => void
  /** Facetas já recortadas pelo contexto da página (categoria/marca da landing). */
  facets: StoreFacetCounts
  /** Categoria da landing — some do filtro e não pode ser trocada por aqui. */
  lockedCategory?: string | null
  /** Marca da landing — mesma regra. */
  lockedBrand?: string | null
  sortKey: StoreSortKey
  onSortChange: (sort: StoreSortKey) => void
  total: number
  isFetching: boolean
}

/**
 * Barra de filtros do catálogo. Duas regras que a versão anterior não tinha:
 * 1. Numa landing de categoria/marca o recorte é fixo — não dá pra somar outra
 *    categoria dentro de "Mouse", porque a página inteira é sobre mouse.
 * 2. Só aparece opção que existe no recorte, sempre com a contagem do lado.
 */
export function StoreFilters({
  state,
  onChange,
  onReset,
  facets,
  lockedCategory = null,
  lockedBrand = null,
  sortKey,
  onSortChange,
  total,
  isFetching,
}: StoreFiltersProps) {
  const activeCount = countActiveFilters(state, lockedCategory, lockedBrand)
  const maxPrice = Math.ceil(facets.priceMaxCents / 100 / 10) * 10

  const categoryOptions = useMemo<FacetOption[]>(
    () =>
      lockedCategory
        ? []
        : facets.categories.map(({ category, count }) => ({ value: category, label: getCategoryLabel(category), count })),
    [facets.categories, lockedCategory]
  )
  const brandOptions = useMemo<FacetOption[]>(
    () => (lockedBrand ? [] : facets.brands.map(({ brand, count }) => ({ value: brand, label: brand, count }))),
    [facets.brands, lockedBrand]
  )
  const conditionOptions = useMemo<FacetOption[]>(
    () =>
      (["new", "opened", "used"] as const)
        .map((value) => ({ value, label: CONDITION_LABEL[value], count: facets.conditions[value] ?? 0 }))
        .filter((option) => option.count > 0),
    [facets.conditions]
  )
  const saleTypeOptions = useMemo<FacetOption[]>(
    () =>
      (["ready_stock", "pre_order"] as const)
        .map((value) => ({ value, label: SALE_TYPE_LABEL[value], count: facets.saleTypes[value] ?? 0 }))
        .filter((option) => option.count > 0),
    [facets.saleTypes]
  )

  // Só oferece a faceta quando ela de fato divide o recorte — "Novo (12)" numa
  // categoria em que tudo é novo não ajuda ninguém a escolher.
  const showConditions = conditionOptions.length > 1
  const showSaleTypes = saleTypeOptions.length > 0
  const showPromo = facets.promoCount > 0 && facets.promoCount < facets.total
  const showInStock = facets.inStockCount > 0 && facets.inStockCount < facets.total

  const controls = (triggerClass: string) => (
    <>
      {categoryOptions.length > 1 && (
        <FacetPopover
          label="Categoria"
          options={categoryOptions}
          values={state.categories}
          onValuesChange={(categories) => onChange({ categories })}
          triggerClass={triggerClass}
          searchable
          searchPlaceholder="Buscar categoria"
        />
      )}
      {brandOptions.length > 1 && (
        <FacetPopover
          label="Marca"
          options={brandOptions}
          values={state.brands}
          onValuesChange={(brands) => onChange({ brands })}
          triggerClass={triggerClass}
          searchable
          searchPlaceholder="Buscar marca"
        />
      )}
      <PricePopover
        value={state.price}
        onChange={(price) => onChange({ price })}
        maxPrice={maxPrice}
        triggerClass={triggerClass}
      />
      {showConditions && (
        <FacetPopover
          label="Estado"
          options={conditionOptions}
          values={state.conditions}
          onValuesChange={(conditions) => onChange({ conditions })}
          triggerClass={triggerClass}
        />
      )}
      {showSaleTypes && (
        <FacetPopover
          label="Entrega"
          options={saleTypeOptions}
          values={state.saleTypes}
          onValuesChange={(saleTypes) => onChange({ saleTypes })}
          triggerClass={triggerClass}
        />
      )}
      {showPromo && (
        <ToggleChip
          label="Em oferta"
          count={facets.promoCount}
          active={state.promoOnly}
          onClick={() => onChange({ promoOnly: !state.promoOnly })}
          icon={Flame}
          triggerClass={triggerClass}
        />
      )}
      {showInStock && (
        <ToggleChip
          label="Disponível"
          count={facets.inStockCount}
          active={state.inStockOnly}
          onClick={() => onChange({ inStockOnly: !state.inStockOnly })}
          icon={PackageCheck}
          triggerClass={triggerClass}
        />
      )}
    </>
  )

  const sortSelect = (className: string) => (
    <Select value={sortKey} onValueChange={(v) => onSortChange(v as StoreSortKey)}>
      <SelectTrigger className={className}>
        <SelectValue>{STORE_SORT_LABEL[sortKey]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STORE_SORT_LABEL) as StoreSortKey[]).map((key) => (
          <SelectItem key={key} value={key}>
            {STORE_SORT_LABEL[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const chips = buildActiveChips(state, onChange, lockedCategory, lockedBrand)

  return (
    <div className="flex flex-col gap-2.5">
      {/* Mobile: um botão "Filtros" com contador, e a contagem à direita. */}
      <div className="flex items-center gap-2.5 md:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-[7px] rounded-xl border border-[#2a2a2a] bg-[#141414] px-4 text-[12.5px] font-bold text-[#e8e8e8]"
            >
              <SlidersHorizontal className="size-[15px]" strokeWidth={1.9} />
              Filtros
              {activeCount > 0 && (
                <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9.5px] font-extrabold text-[#04140d]">
                  {activeCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 overflow-y-auto">
            {lockedCategory && <LockedPill value={lockedCategory} kind="category" className="h-11 w-full" />}
            {lockedBrand && <LockedPill value={lockedBrand} kind="brand" className="h-11 w-full" />}
            {controls(MOBILE_TRIGGER_CLASS)}
            {sortSelect(MOBILE_TRIGGER_CLASS)}
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-muted-foreground">
                <X className="size-3.5" />
                Limpar ({activeCount})
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <span className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-[#8a8a8a]">
          <b className="text-white">{total}</b> produto{total !== 1 ? "s" : ""}
          {isFetching && <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />}
        </span>
      </div>

      {/* Desktop: a fileira compacta do mock — a busca não aparece aqui,
          ela vive na faixa de categorias logo acima. */}
      <div className="hidden flex-wrap items-center gap-2.5 rounded-[14px] border border-[#262626] bg-card px-3.5 py-3 md:flex">
        <span className="inline-flex shrink-0 items-center gap-[7px] border-r border-[#262626] pr-3 text-xs font-bold text-[#8a8a8a]">
          <SlidersHorizontal className="size-3.5" strokeWidth={1.9} />
          Filtros
        </span>

        {lockedCategory && <LockedPill value={lockedCategory} kind="category" />}
        {lockedBrand && <LockedPill value={lockedBrand} kind="brand" />}

        {controls(TRIGGER_CLASS)}

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="ml-auto h-9 gap-1.5 text-[12.5px] text-[#8a8a8a] hover:text-white"
          >
            <X className="size-3.5" />
            Limpar ({activeCount})
          </Button>
        )}

        {sortSelect(
          cn(
            "flex h-9 w-auto items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-white bg-white px-3.5 text-[12.5px] font-bold text-black hover:opacity-90 dark:bg-white dark:hover:bg-white",
            activeCount === 0 && "ml-auto"
          )
        )}
      </div>

      {/* Resumo do que está aplicado — cada pedaço sai sozinho, sem precisar
          reabrir o popover que o criou. */}
      {chips.length > 0 && (
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] bg-[#141414] py-[5px] pl-3 pr-2 text-[11.5px] font-semibold text-[#cfcfcf]"
            >
              <span className="text-[#7a7a7a]">{chip.group}:</span>
              <span className="max-w-[180px] truncate">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remover filtro ${chip.label}`}
                className="flex size-4 items-center justify-center rounded-full text-[#6e6e6e] transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <span className="hidden items-center gap-1.5 text-[12.5px] font-semibold text-[#8a8a8a] md:flex">
        <b className="text-white">{total}</b> produto{total !== 1 ? "s" : ""}
        {isFetching && <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />}
      </span>
    </div>
  )
}

/** Recorte fixo da landing: informa o contexto sem fingir que dá pra trocar. */
function LockedPill({ value, kind, className }: { value: string; kind: "category" | "brand"; className?: string }) {
  const { icon: Icon, tint } = getCategoryIcon(kind === "category" ? value : null)
  return (
    <span
      className={cn(
        "flex h-9 shrink-0 items-center gap-[7px] rounded-[10px] border px-3.5 text-[12.5px] font-bold text-white",
        className
      )}
      style={{ borderColor: `color-mix(in oklab, ${tint} 38%, transparent)`, background: `color-mix(in oklab, ${tint} 12%, #0e0e0e)` }}
    >
      {kind === "category" && <Icon className="size-[14px] shrink-0" style={{ color: tint }} strokeWidth={1.9} />}
      {kind === "category" ? getCategoryLabel(value) : value}
    </span>
  )
}

interface ActiveChip {
  key: string
  group: string
  label: string
  onRemove: () => void
}

function buildActiveChips(
  state: StoreFilterState,
  onChange: (patch: Partial<StoreFilterState>) => void,
  lockedCategory: string | null,
  lockedBrand: string | null
): ActiveChip[] {
  const chips: ActiveChip[] = []

  if (state.query.trim()) {
    chips.push({
      key: "query",
      group: "Busca",
      label: `“${state.query.trim()}”`,
      onRemove: () => onChange({ query: "" }),
    })
  }
  for (const category of state.categories) {
    if (category === lockedCategory) continue
    chips.push({
      key: `cat:${category}`,
      group: "Categoria",
      label: getCategoryLabel(category),
      onRemove: () => onChange({ categories: state.categories.filter((c) => c !== category) }),
    })
  }
  for (const brand of state.brands) {
    if (brand === lockedBrand) continue
    chips.push({
      key: `brand:${brand}`,
      group: "Marca",
      label: brand,
      onRemove: () => onChange({ brands: state.brands.filter((b) => b !== brand) }),
    })
  }
  for (const condition of state.conditions) {
    chips.push({
      key: `cond:${condition}`,
      group: "Estado",
      label: CONDITION_LABEL[condition] ?? condition,
      onRemove: () => onChange({ conditions: state.conditions.filter((c) => c !== condition) }),
    })
  }
  for (const saleType of state.saleTypes) {
    chips.push({
      key: `sale:${saleType}`,
      group: "Entrega",
      label: SALE_TYPE_LABEL[saleType] ?? saleType,
      onRemove: () => onChange({ saleTypes: state.saleTypes.filter((s) => s !== saleType) }),
    })
  }
  if (state.price) {
    chips.push({
      key: "price",
      group: "Preço",
      label: `${formatShortBRL(state.price[0])} – ${formatShortBRL(state.price[1])}`,
      onRemove: () => onChange({ price: null }),
    })
  }
  if (state.promoOnly) {
    chips.push({ key: "promo", group: "Filtro", label: "Em oferta", onRemove: () => onChange({ promoOnly: false }) })
  }
  if (state.inStockOnly) {
    chips.push({ key: "stock", group: "Filtro", label: "Disponível", onRemove: () => onChange({ inStockOnly: false }) })
  }
  return chips
}
