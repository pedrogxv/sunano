"use client"

import { Search, SlidersHorizontal, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type PriceBand = "all" | "budget" | "mid" | "premium"
type Category = "all" | "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"

const KEYBOARD_LAYOUTS: KeyboardLayout[] = ["60%", "75%", "tkl", "full-size"]
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
    { key: "dac_amp",  label: t.categories.labels.dac_amp },
  ]

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
          {categoryOptions.map((category) => {
            const active = selectedCategory === category.key

            return (
              <button
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/40"
                )}
                key={category.key}
                onClick={() => onCategoryChange(category.key)}
                type="button"
              >
                {category.label}
              </button>
            )
          })}
        </div>
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
                  <Select onValueChange={onBrandChange} value={selectedBrand}>
                    <SelectTrigger className="border-border bg-muted/30">
                      <SelectValue placeholder={t.common.brand} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBrands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand === "all" ? t.common.allFem : formatLabel(brand)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      <SelectItem value="mid">Mid ($81 - $160)</SelectItem>
                      <SelectItem value="premium">Premium ($160+)</SelectItem>
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
            <button onClick={() => onQueryChange("")} className="hover:text-primary">
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {selectedBrand !== "all" && (
          <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            {formatLabel(selectedBrand)}
            <button onClick={() => onBrandChange("all")} className="hover:text-emerald-200">
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {selectedPriceBand !== "all" && (
          <Badge variant="outline" className="gap-1.5 rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
            {formatLabel(selectedPriceBand)}
            <button onClick={() => onPriceBandChange("all")} className="hover:text-amber-200">
              <X className="size-3" />
            </button>
          </Badge>
        )}
      </div>
    </div>
  )
}
