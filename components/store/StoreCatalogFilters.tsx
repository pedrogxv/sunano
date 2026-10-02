"use client"

import { useState } from "react"
import { Check, ChevronDown, Flame, PackageCheck, Rocket, SlidersHorizontal, X } from "lucide-react"

import {
  CONDITION_LABEL,
  countActiveFilters,
  SALE_TYPE_LABEL,
  type StoreFilterState,
} from "@/components/store/StoreFilters"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { StoreFacetCounts } from "@/lib/server/repositories/store-repository"
import { findPriceBand, type CatalogGroupConfig, type StoreCatalogFacetCounts } from "@/lib/store-catalog"
import { cn } from "@/lib/utils"

/**
 * Filtros da página de categoria (/loja/categoria/[categoria]): chips rápidos
 * no topo, barra lateral completa no desktop e o mesmo conteúdo num painel no
 * celular. Tudo sai de `lib/store-catalog.ts` (o que existe) e das contagens
 * de `getStoreFilterOptions` (o que tem produto): opção com zero produto não
 * aparece, para nenhum clique zerar a grade.
 */

type Patch = (patch: Partial<StoreFilterState>) => void

type CatalogFiltersProps = {
  config: CatalogGroupConfig | null
  counts: StoreCatalogFacetCounts | null
  /** Facetas comuns do recorte (marca, estado, oferta, estoque). */
  facets: StoreFacetCounts
  state: StoreFilterState
  onChange: Patch
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

/** Escolher faixa pronta limpa a faixa digitada, e vice-versa: as duas não valem juntas. */
function selectPriceBand(state: StoreFilterState, key: string): Partial<StoreFilterState> {
  return { priceBand: state.priceBand === key ? null : key, price: null }
}

// ────────────────────────────────────────────
// Chips rápidos
// ────────────────────────────────────────────

export function StoreQuickFilters({ config, counts, state, onChange }: Omit<CatalogFiltersProps, "facets">) {
  if (!config || !counts) return null

  const chips = config.quickFilters.flatMap((quick) => {
    if (quick.kind === "collection") {
      const collection = config.collections.find((item) => item.key === quick.key)
      const count = counts.collections[quick.key] ?? 0
      if (!collection || count === 0) return []
      return [
        {
          key: `tipo:${quick.key}`,
          label: collection.label,
          count,
          active: state.collections.includes(quick.key),
          onClick: () => onChange({ collections: toggle(state.collections, quick.key) }),
        },
      ]
    }
    const count = counts.priceBands[quick.band.key] ?? 0
    if (count === 0) return []
    return [
      {
        key: `preco:${quick.band.key}`,
        label: quick.band.label,
        count,
        active: state.priceBand === quick.band.key,
        onClick: () => onChange(selectPriceBand(state, quick.band.key)),
      },
    ]
  })

  if (chips.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Filtros rápidos"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={chip.active}
          onClick={chip.onClick}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors",
            chip.active
              ? "border-emerald-500/50 bg-emerald-500/12 text-white"
              : "border-[#2a2a2a] bg-[#141414] text-[#cfcfcf] hover:border-foreground/25 hover:text-white"
          )}
        >
          {chip.active && <Check className="size-3.5 text-emerald-400" strokeWidth={2.8} />}
          {chip.label}
          <span className={cn("text-[11px] tabular-nums", chip.active ? "text-emerald-400/80" : "text-[#6e6e6e]")}>
            {chip.count}
          </span>
        </button>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────
// Barra lateral
// ────────────────────────────────────────────

function FilterSection({
  title,
  activeCount = 0,
  defaultOpen = true,
  children,
}: {
  title: string
  activeCount?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-[#1f1f1f] py-3.5 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-bold text-white">
          {title}
          {activeCount > 0 && (
            <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9.5px] font-extrabold text-[#04140d]">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown className={cn("size-4 text-[#6e6e6e] transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-2.5 flex flex-col gap-0.5">{children}</div>}
    </section>
  )
}

function CheckRow({
  label,
  count,
  checked,
  onClick,
  radio = false,
}: {
  label: string
  count?: number
  checked: boolean
  onClick: () => void
  radio?: boolean
}) {
  return (
    <button
      type="button"
      role={radio ? "radio" : "checkbox"}
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-[6px] text-left transition-colors hover:bg-white/5"
    >
      <span
        className={cn(
          "flex size-[15px] shrink-0 items-center justify-center border transition-colors",
          radio ? "rounded-full" : "rounded-[5px]",
          checked ? "border-emerald-500 bg-emerald-500" : "border-[#3a3a3a]"
        )}
      >
        {checked &&
          (radio ? (
            <span className="size-[5px] rounded-full bg-[#04140d]" />
          ) : (
            <Check className="size-[11px] text-[#04140d]" strokeWidth={3.4} />
          ))}
      </span>
      <span className={cn("flex-1 truncate text-[12.5px]", checked ? "font-semibold text-white" : "font-medium text-[#cfcfcf]")}>
        {label}
      </span>
      {count != null && <span className="text-[11px] tabular-nums text-[#6e6e6e]">{count}</span>}
    </button>
  )
}

/** Marcas: as 8 mais frequentes, o resto atrás de "Ver todas". */
const BRANDS_VISIBLE = 8

function BrandSection({ facets, state, onChange }: Pick<CatalogFiltersProps, "facets" | "state" | "onChange">) {
  const [showAll, setShowAll] = useState(false)
  if (facets.brands.length < 2) return null
  const visible = showAll ? facets.brands : facets.brands.slice(0, BRANDS_VISIBLE)
  // Marca marcada que ficaria escondida atrás de "Ver todas" continua visível.
  const hiddenSelected = showAll
    ? []
    : facets.brands.filter((item, index) => index >= BRANDS_VISIBLE && state.brands.includes(item.brand))

  return (
    <FilterSection title="Marca" activeCount={state.brands.length}>
      {[...visible, ...hiddenSelected].map(({ brand, count }) => (
        <CheckRow
          key={brand}
          label={brand}
          count={count}
          checked={state.brands.includes(brand)}
          onClick={() => onChange({ brands: toggle(state.brands, brand) })}
        />
      ))}
      {facets.brands.length > BRANDS_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-1 self-start px-1.5 text-[12px] font-bold text-emerald-400 transition-opacity hover:opacity-80"
        >
          {showAll ? "Ver menos" : `Ver todas (${facets.brands.length})`}
        </button>
      )}
    </FilterSection>
  )
}

function PriceSection({ config, counts, state, onChange }: Omit<CatalogFiltersProps, "facets">) {
  const [min, setMin] = useState(state.price ? String(state.price[0]) : "")
  const [max, setMax] = useState(state.price ? String(state.price[1]) : "")
  const bands = (config?.priceBands ?? []).filter((band) => (counts?.priceBands[band.key] ?? 0) > 0)
  // Faixa vinda de um chip rápido ("Até R$500") não está na lista: aparece marcada mesmo assim.
  const quickBand =
    config && state.priceBand && !bands.some((band) => band.key === state.priceBand) ? findPriceBand(config, state.priceBand) : null

  const applyCustom = () => {
    const minValue = Math.max(0, Number(min) || 0)
    const maxValue = Number(max) || 0
    if (!min && !max) {
      onChange({ price: null })
      return
    }
    // Sem máximo = sem teto: o servidor recebe um teto alto em vez de "infinito".
    const upper = maxValue > 0 ? Math.max(maxValue, minValue) : 1_000_000
    onChange({ price: [minValue, upper], priceBand: null })
  }

  return (
    <FilterSection title="Preço" activeCount={state.priceBand || state.price ? 1 : 0}>
      {quickBand && <CheckRow radio label={quickBand.label} checked onClick={() => onChange({ priceBand: null })} />}
      {bands.map((band) => (
        <CheckRow
          key={band.key}
          radio
          label={band.label}
          count={counts?.priceBands[band.key]}
          checked={state.priceBand === band.key}
          onClick={() => onChange(selectPriceBand(state, band.key))}
        />
      ))}
      <form
        className="mt-2 flex items-center gap-1.5 px-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          applyCustom()
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5">
          <span className="text-[11px] text-[#6e6e6e]">R$</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Mín"
            aria-label="Preço mínimo"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            className="w-full min-w-0 bg-transparent text-[12.5px] font-semibold text-white outline-none placeholder:text-[#5e5e5e]"
          />
        </label>
        <span className="text-[#4a4a4a]">–</span>
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5">
          <span className="text-[11px] text-[#6e6e6e]">R$</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Máx"
            aria-label="Preço máximo"
            value={max}
            onChange={(event) => setMax(event.target.value)}
            className="w-full min-w-0 bg-transparent text-[12.5px] font-semibold text-white outline-none placeholder:text-[#5e5e5e]"
          />
        </label>
        <button
          type="submit"
          aria-label="Aplicar faixa de preço"
          className="h-[30px] shrink-0 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 text-[11.5px] font-bold text-white transition-colors hover:border-foreground/30"
        >
          Ok
        </button>
      </form>
    </FilterSection>
  )
}

/** Conteúdo completo dos filtros: o mesmo na barra lateral e no painel do celular. */
function CatalogFilterSections({ config, counts, facets, state, onChange }: CatalogFiltersProps) {
  const collections = (config?.collections ?? []).filter((item) => (counts?.collections[item.key] ?? 0) > 0)

  const conditionOptions = (["new", "opened", "used"] as const).filter((value) => (facets.conditions[value] ?? 0) > 0)
  const showConditions = conditionOptions.length > 1
  const showPromo = facets.promoCount > 0 && facets.promoCount < facets.total
  const showInStock = facets.inStockCount > 0 && facets.inStockCount < facets.total
  const showPreOrder = (facets.saleTypes.pre_order ?? 0) > 0 && facets.saleTypes.pre_order < facets.total

  return (
    <div className="flex flex-col">
      {collections.length > 0 && (
        <FilterSection title="Tipo" activeCount={state.collections.length}>
          {collections.map((collection) => (
            <CheckRow
              key={collection.key}
              label={collection.label}
              count={counts?.collections[collection.key]}
              checked={state.collections.includes(collection.key)}
              onClick={() => onChange({ collections: toggle(state.collections, collection.key) })}
            />
          ))}
        </FilterSection>
      )}

      <BrandSection facets={facets} state={state} onChange={onChange} />

      {/* Remonta quando a faixa digitada muda por fora (Limpar, chip removido): os campos não guardam valor velho. */}
      <PriceSection
        key={state.price ? state.price.join("-") : "sem-faixa"}
        config={config}
        counts={counts}
        state={state}
        onChange={onChange}
      />

      {(config?.facets ?? []).map((facet) => {
        const facetCounts = counts?.facets[facet.key] ?? {}
        const options = facet.options.filter((option) => (facetCounts[option.value] ?? 0) > 0)
        if (options.length === 0) return null
        const selected = state.catalogFacets[facet.key] ?? []
        return (
          <FilterSection key={facet.key} title={facet.label} activeCount={selected.length}>
            {options.map((option) => (
              <CheckRow
                key={option.value}
                label={option.label}
                count={facetCounts[option.value]}
                checked={selected.includes(option.value)}
                onClick={() =>
                  onChange({ catalogFacets: { ...state.catalogFacets, [facet.key]: toggle(selected, option.value) } })
                }
              />
            ))}
          </FilterSection>
        )
      })}

      {showConditions && (
        <FilterSection title="Estado" activeCount={state.conditions.length}>
          {conditionOptions.map((value) => (
            <CheckRow
              key={value}
              label={CONDITION_LABEL[value]}
              count={facets.conditions[value]}
              checked={state.conditions.includes(value)}
              onClick={() => onChange({ conditions: toggle(state.conditions, value) })}
            />
          ))}
        </FilterSection>
      )}

      {(showPromo || showInStock || showPreOrder) && (
        <FilterSection
          title="Disponibilidade"
          activeCount={(state.promoOnly ? 1 : 0) + (state.inStockOnly ? 1 : 0) + state.saleTypes.length}
        >
          {showPromo && (
            <ToggleRow
              icon={Flame}
              label="Em oferta"
              count={facets.promoCount}
              checked={state.promoOnly}
              onClick={() => onChange({ promoOnly: !state.promoOnly })}
            />
          )}
          {showInStock && (
            <ToggleRow
              icon={PackageCheck}
              label="Disponível"
              count={facets.inStockCount}
              checked={state.inStockOnly}
              onClick={() => onChange({ inStockOnly: !state.inStockOnly })}
            />
          )}
          {showPreOrder && (
            <ToggleRow
              icon={Rocket}
              label={SALE_TYPE_LABEL.pre_order}
              count={facets.saleTypes.pre_order}
              checked={state.saleTypes.includes("pre_order")}
              onClick={() => onChange({ saleTypes: toggle(state.saleTypes, "pre_order") })}
            />
          )}
        </FilterSection>
      )}
    </div>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  count,
  checked,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  count: number
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-[6px] text-left transition-colors hover:bg-white/5"
    >
      <Icon className={cn("size-[14px] shrink-0", checked ? "text-emerald-400" : "text-[#6e6e6e]")} strokeWidth={2.2} />
      <span className={cn("flex-1 text-[12.5px]", checked ? "font-semibold text-white" : "font-medium text-[#cfcfcf]")}>
        {label}
      </span>
      <span className="text-[11px] tabular-nums text-[#6e6e6e]">{count}</span>
      <span
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
          checked ? "bg-emerald-500" : "bg-[#2e2e2e]"
        )}
      >
        <span
          className={cn("absolute top-0.5 size-[14px] rounded-full bg-white transition-all", checked ? "left-4" : "left-0.5")}
        />
      </span>
    </button>
  )
}

export function StoreCatalogSidebar(
  props: CatalogFiltersProps & { lockedCategory: string | null; onReset: () => void }
) {
  const activeCount = countActiveFilters(props.state, props.lockedCategory, null)
  return (
    <aside aria-label="Filtros" className="flex flex-col">
      <div className="flex items-center justify-between gap-2 pb-1">
        <span className="flex items-center gap-2 text-[13px] font-bold text-white">
          <SlidersHorizontal className="size-4 text-[#8a8a8a]" strokeWidth={1.9} />
          Filtros
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={props.onReset}
            className="text-[12px] font-bold text-[#8a8a8a] transition-colors hover:text-white"
          >
            Limpar ({activeCount})
          </button>
        )}
      </div>
      <CatalogFilterSections {...props} />
    </aside>
  )
}

/** Celular: botão "Filtros" com contador e o mesmo conteúdo da barra lateral num painel. */
export function StoreCatalogMobileFilters(
  props: CatalogFiltersProps & { lockedCategory: string | null; onReset: () => void; total: number; isFetching: boolean }
) {
  const [open, setOpen] = useState(false)
  const activeCount = countActiveFilters(props.state, props.lockedCategory, null)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-[7px] rounded-xl border border-[#2a2a2a] bg-[#141414] px-3.5 text-[12.5px] font-bold text-[#e8e8e8]"
      >
        <SlidersHorizontal className="size-[15px]" strokeWidth={1.9} />
        Filtros
        {activeCount > 0 && (
          <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9.5px] font-extrabold text-[#04140d]">
            {activeCount}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100dvh-2rem)] max-h-none flex-col gap-0 overflow-hidden border border-[#262626] bg-card p-0 sm:max-w-md"
        >
          <DialogHeader className="flex-row items-center justify-between gap-2 border-b border-[#222] px-4 py-3 text-left">
            <div>
              <DialogTitle className="text-[15px]">Filtros</DialogTitle>
              <DialogDescription className="text-[11.5px]">Tipo, marca, preço e especificações.</DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar filtros"
              className="flex size-9 items-center justify-center rounded-full text-[#8a8a8a] transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4">
            <CatalogFilterSections {...props} />
          </div>
          <div className="flex items-center gap-2 border-t border-[#222] px-4 py-3">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={props.onReset}
                className="h-11 rounded-xl border border-[#2a2a2a] px-4 text-[12.5px] font-bold text-[#cfcfcf]"
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 flex-1 rounded-xl bg-white text-[13px] font-bold text-black"
            >
              {props.isFetching ? "Carregando…" : `Ver ${props.total} produto${props.total === 1 ? "" : "s"}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
