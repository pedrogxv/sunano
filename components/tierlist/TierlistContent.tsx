"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { FilterBar } from "./FilterBar"
import { TierlistGrid } from "./TierlistGrid"

type Category = "all" | "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type PriceBand = "all" | "budget" | "mid" | "premium"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"

type RatingKey = "overall" | "performance" | "build" | "value" | "software" | "battery" | "qc"
type Ratings = Partial<Record<RatingKey, number>>

type Peripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: Category
  tier: TierValue
  price: number
  tags: Tag[]
  ratings?: Ratings
  specs: {
    mouseShape?: MouseShape
    keyboardLayout?: KeyboardLayout
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: "cloth" | "hybrid" | "glass"
    driver?: string
    profile?: string
    adminValueBand?: string
    adminRecommendedBand?: string
    adminSoundProfile?: string
    adminTypingFeel?: string
  }
}

interface TierlistContentProps {
  initialData: Peripheral[]
  categoryLabels: Record<string, string>
}

function getPriceBand(price: number): Exclude<PriceBand, "all"> {
  if (price <= 80) return "budget"
  if (price <= 160) return "mid"
  return "premium"
}

export function TierlistContent({ initialData, categoryLabels }: TierlistContentProps) {
  const pathname = usePathname()
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>("keyboard")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedPriceBand, setSelectedPriceBand] = useState<PriceBand>("all")
  const [selectedMouseShape, setSelectedMouseShape] = useState<MouseShape | "all">("all")
  const [selectedKeyboardLayout, setSelectedKeyboardLayout] = useState<KeyboardLayout | "all">("all")

  const categoryLabel = categoryLabels[selectedCategory]

  useEffect(() => {
    if (pathname === "/tierlist") {
      setSelectedCategory("keyboard")
      setSelectedBrand("all")
      setSelectedMouseShape("all")
      setSelectedKeyboardLayout("all")
    }
  }, [pathname])

  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category)
    setSelectedBrand("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
  }

  const availableBrands = useMemo(() => {
    const inCategory =
      selectedCategory === "all"
        ? initialData
        : initialData.filter((item) => item.category === selectedCategory)
    return ["all", ...Array.from(new Set(inCategory.map((item) => item.brand)))]
  }, [selectedCategory, initialData])

  const filtered = useMemo(() => {
    return initialData.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false

      const searchable = `${item.name} ${item.brand} ${item.specs.driver ?? ""} ${item.specs.profile ?? ""}`
        .toLowerCase()
      const matchesQuery = query.trim() === "" || searchable.includes(query.trim().toLowerCase())
      const matchesBrand = selectedBrand === "all" || item.brand === selectedBrand
      const matchesPrice = selectedPriceBand === "all" || getPriceBand(item.price) === selectedPriceBand

      const matchesMouseShape =
        selectedCategory !== "mouse" ||
        selectedMouseShape === "all" ||
        item.specs.mouseShape === selectedMouseShape

      const matchesKeyboardLayout =
        selectedCategory !== "keyboard" ||
        selectedKeyboardLayout === "all" ||
        item.specs.keyboardLayout === selectedKeyboardLayout

      return matchesQuery && matchesBrand && matchesPrice && matchesMouseShape && matchesKeyboardLayout
    })
  }, [query, selectedCategory, selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout, initialData])

  const activeFiltersCount = useMemo(() => {
    return [selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout].filter(
      (value) => value !== "all",
    ).length + (query.trim() ? 1 : 0)
  }, [query, selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout])

  const resetFilters = () => {
    setQuery("")
    setSelectedBrand("all")
    setSelectedPriceBand("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
  }

  return (
    <>
      <FilterBar
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        query={query}
        onQueryChange={setQuery}
        selectedBrand={selectedBrand}
        onBrandChange={setSelectedBrand}
        selectedPriceBand={selectedPriceBand}
        onPriceBandChange={setSelectedPriceBand}
        selectedMouseShape={selectedMouseShape}
        onMouseShapeChange={setSelectedMouseShape}
        selectedKeyboardLayout={selectedKeyboardLayout}
        onKeyboardLayoutChange={setSelectedKeyboardLayout}
        availableBrands={availableBrands}
        activeFiltersCount={activeFiltersCount}
        filteredCount={filtered.length}
        onReset={resetFilters}
        showMouseShapeFilter={selectedCategory === "mouse"}
        showKeyboardLayoutFilter={selectedCategory === "keyboard"}
      />

      <TierlistGrid filtered={filtered} category={selectedCategory} />
    </>
  )
}
