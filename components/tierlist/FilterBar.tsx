"use client"

import {
  Armchair,
  CircleDot,
  CircuitBoard,
  Ear,
  Footprints,
  Headphones,
  Keyboard,
  Monitor,
  Mouse,
  Plug,
  Search,
  SlidersHorizontal,
  Square,
  ToggleLeft,
  Volume2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"

type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type PriceBand = "all" | "budget" | "mid" | "premium" | "golpe"
type Category = "all" | "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp" | "psu"

const KEYBOARD_LAYOUTS: KeyboardLayout[] = ["60%", "75%", "tkl", "full-size"]

const CATEGORY_ICONS: Record<Exclude<Category, "all">, React.ComponentType<{ className?: string }>> = {
  keyboard: Keyboard,
  mouse: Mouse,
  mousepad: Square,
  glasspad: CircleDot,
  iem: Ear,
  headset: Headphones,
  feet: Footprints,
  chairs: Armchair,
  monitors: Monitor,
  switches: ToggleLeft,
  pcb: CircuitBoard,
  dac_amp: Volume2,
  psu: Plug,
}
function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

interface FilterBarProps {
  selectedCategory: Category
  onCategoryChange: (category: Category) => void
  query: string
  onQueryChange: (value: string) => void
  selectedBrand: string
  onBrandChange: (brand: string) => void
  selectedPriceBand: PriceBand
  onPriceBandChange: (band: PriceBand) => void
  selectedMouseShape: MouseShape | "all"
  onMouseShapeChange: (shape: MouseShape | "all") => void
  selectedKeyboardLayout: KeyboardLayout | "all"
  onKeyboardLayoutChange: (layout: KeyboardLayout | "all") => void
  availableBrands: string[]
  activeFiltersCount: number
  filteredCount: number
  onReset: () => void
  showMouseShapeFilter: boolean
  showKeyboardLayoutFilter: boolean
  /** Omitidos no admin: lá não faz sentido compartilhar a tierlist. */
  shareTitle?: string
  sharePath?: string
}

export function FilterBar({
  selectedCategory,
  onCategoryChange,
  query,
  onQueryChange,
  selectedBrand,
  onBrandChange,
  selectedPriceBand,
  onPriceBandChange,
  selectedMouseShape,
  onMouseShapeChange,
  selectedKeyboardLayout,
  onKeyboardLayoutChange,
  availableBrands,
  activeFiltersCount,
  filteredCount,
  onReset,
  showMouseShapeFilter,
  showKeyboardLayoutFilter,
  shareTitle,
  sharePath,
}: FilterBarProps) {
  const t = useT()
  const categoryOptions: { key: Category; label: string }[] = [
    { key: "keyboard", label: t.categories.labels.keyboard },
    { key: "mouse",    label: t.categories.labels.mouse },
    { key: "mousepad", label: t.categories.labels.mousepad },
    { key: "glasspad", label: t.categories.labels.glasspad },
    { key: "iem",      label: t.categories.labels.iem },
    { key: "headset",  label: t.categories.labels.headset },
    { key: "feet",     label: t.categories.labels.feet },
    { key: "chairs",   label: t.categories.labels.chairs },
    { key: "monitors", label: t.categories.labels.monitors },
    { key: "switches", label: t.categories.labels.switches },
    { key: "pcb",      label: t.categories.labels.pcb },
    { key: "dac_amp",  label: t.categories.labels.dac_amp },
    { key: "psu",      label: t.categories.labels.psu },
  ]

  const selectedCategoryLabel =
    categoryOptions.find((c) => c.key === selectedCategory)?.label ?? ""
  const SelectedIcon = CATEGORY_ICONS[selectedCategory as Exclude<Category, "all">]

  return (
    <div className={cn("space-y-3 rounded-xl border p-3 sm:p-4", CARD_SURFACE)}>
      {/* Categorias — mobile: um único <Select> (1 linha, sem aperto nem
          scroll horizontal); sm+: chips com ícone que quebram linha.

          O <SelectValue> é obrigatório pro Radix ligar o trigger (sem ele o
          dropdown não abre), mas ele espelha TODO o conteúdo do <SelectItem>
          escolhido — ícone incluso — e o `*:data-[slot=select-value]:flex` do
          trigger vence um `sr-only`/`hidden` posto direto nele. Então fica
          dentro de um wrapper `hidden`, e o valor visível é montado à mão. */}
      <div className="sm:hidden">
        <Select
          value={selectedCategory}
          onValueChange={(value) => onCategoryChange(value as Category)}
        >
          <SelectTrigger className="h-10 w-full border-border bg-muted/30">
            <span className="flex min-w-0 items-center gap-2">
              {SelectedIcon && <SelectedIcon className="size-4 shrink-0 text-primary" />}
              <span className="truncate">{selectedCategoryLabel}</span>
            </span>
            <span className="hidden">
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((category) => {
              const Icon = CATEGORY_ICONS[category.key as Exclude<Category, "all">]
              return (
                <SelectItem key={category.key} value={category.key} className="pl-2.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  {category.label}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden flex-wrap gap-1.5 sm:flex">
        {categoryOptions.map((category) => {
          const active = selectedCategory === category.key
          const Icon = CATEGORY_ICONS[category.key as Exclude<Category, "all">]

          return (
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/40"
              )}
              key={category.key}
              onClick={() => onCategoryChange(category.key)}
              type="button"
            >
              {Icon && <Icon className="size-3.5 shrink-0" />}
              <span>{category.label}</span>
            </button>
          )
        })}
      </div>

      {/* Search and Controls Row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t.filters.searchPeripherals}
            className="h-10 border-border bg-muted/30 pl-10 text-sm placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-primary/20"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t.filters.searchPlaceholder}
            value={query}
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "gap-2 border-border bg-muted/30 hover:bg-muted/40",
                  activeFiltersCount > 0 && "border-primary/40 text-primary"
                )}
              >
                <SlidersHorizontal className="size-4" />
                {t.filters.filtersLabel}
                {activeFiltersCount > 0 && (
                  <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 space-y-4 rounded-xl border-border bg-popover p-4 shadow-xl sm:w-96"
            >
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t.filters.filterTierlist}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.filters.filterDesc}
                </p>
              </div>

              <div className="h-px bg-border" />

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Brand Filter */}
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t.common.brand}
                  </label>
                  <Combobox
                    options={availableBrands.map((brand) => ({
                      value: brand,
                      label: brand === "all" ? t.common.allFem : formatLabel(brand),
                    }))}
                    value={selectedBrand}
                    onValueChange={onBrandChange}
                    placeholder={t.common.brand}
                    searchPlaceholder={t.common.brand}
                    className="border-border bg-muted/30"
                  />
                </div>

                {/* Price Filter */}
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t.filters.priceRange}
                  </label>
                  <Select
                    onValueChange={(value) => onPriceBandChange(value as PriceBand)}
                    value={selectedPriceBand}
                  >
                    <SelectTrigger className="border-border bg-muted/30">
                      <SelectValue placeholder={t.common.price} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.common.all}</SelectItem>
                      <SelectItem value="budget">{t.filters.budgetBand}</SelectItem>
                      <SelectItem value="mid">Mid (R$300 até R$500)</SelectItem>
                      <SelectItem value="premium">High End (R$1000+)</SelectItem>
                      <div className="my-1 h-px bg-border" />
                      <SelectItem value="golpe" className="font-semibold text-destructive focus:text-destructive">
                        {t.filters.golpeBand}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Mouse Shape Filter */}
                {showMouseShapeFilter && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {t.filters.mouseShape}
                    </label>
                    <Select
                      onValueChange={(value) => onMouseShapeChange(value as MouseShape | "all")}
                      value={selectedMouseShape}
                    >
                      <SelectTrigger className="border-border bg-muted/30">
                        <SelectValue placeholder="Shape" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t.common.all}</SelectItem>
                        <SelectItem value="symmetrical">{t.filters.symmetrical}</SelectItem>
                        <SelectItem value="ergonomic">{t.filters.ergonomic}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Keyboard Layout Filter */}
                {showKeyboardLayoutFilter && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {t.filters.keyboardLayout}
                    </label>
                    <Select
                      onValueChange={(value) => onKeyboardLayoutChange(value as KeyboardLayout | "all")}
                      value={selectedKeyboardLayout}
                    >
                      <SelectTrigger className="border-border bg-muted/30">
                        <SelectValue placeholder="Layout" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t.common.all}</SelectItem>
                        {KEYBOARD_LAYOUTS.map((layout) => (
                          <SelectItem key={layout} value={layout}>
                            {layout.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Reset Button */}
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
              {t.common.clear}
            </Button>
          )}

          {sharePath && shareTitle && (
            <ShareMenu title={shareTitle} path={sharePath} showEmbed={false} />
          )}
        </div>
      </div>

      {/* Active Filters Display */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded-full bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          {t.filters.itemCount(filteredCount)}
        </Badge>

        {query.trim() && (
          <Badge variant="outline" className="gap-1.5 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            {t.filters.searchBadge}: {query.trim()}
            <button
              onClick={() => onQueryChange("")}
              aria-label={`${t.filters.searchBadge}: ${t.common.clear}`}
              className="-my-1 -mr-1.5 p-1.5 hover:text-primary"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {selectedBrand !== "all" && (
          <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            {formatLabel(selectedBrand)}
            <button
              onClick={() => onBrandChange("all")}
              aria-label={`${t.common.brand}: ${t.common.clear}`}
              className="-my-1 -mr-1.5 p-1.5 hover:text-emerald-200"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {selectedPriceBand !== "all" && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 rounded-full px-3 py-1 text-xs",
              selectedPriceBand === "golpe"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            )}
          >
            {selectedPriceBand === "golpe" ? t.filters.golpeBand : formatLabel(selectedPriceBand)}
            <button
              onClick={() => onPriceBandChange("all")}
              aria-label={`${t.common.price}: ${t.common.clear}`}
              className="-my-1 -mr-1.5 p-1.5 hover:text-amber-200"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}
      </div>
    </div>
  )
}
