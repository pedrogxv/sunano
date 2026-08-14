"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FilterBar } from "./FilterBar"
import { TierlistGrid } from "./TierlistGrid"

type Category = "all" | "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type PriceBand = "all" | "budget" | "mid" | "premium" | "golpe"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado" | "raro" | "fibra_carbono" | "control" | "speed" | "white_label" | "ips" | "va" | "tn" | "oled" | "miniled" | "fhd" | "qhd" | "4k" | "headphone"

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
    adminTier_value?: TierValue
    adminTier_recommended?: TierValue
    adminTier_oled?: TierValue
    adminTier_soundTyping?: TierValue
    adminTier_mechanical?: TierValue
    adminTier_pcb?: TierValue
    tierlistCategories?: string[]
    golpe?: boolean
  }
}

interface TierlistContentProps {
  initialData: Peripheral[]
  categoryLabels: Record<string, string>
}

function getPriceBand(price: number): Exclude<PriceBand, "all"> | null {
  if (price <= 300) return "budget"
  if (price <= 500) return "mid"
  if (price >= 1000) return "premium"
  return null
}

const CATEGORY_VALUES: Category[] = [
  "all", "keyboard", "pcb", "mouse", "mousepad", "glasspad", "iem", "headset", "feet", "chairs", "monitors", "switches", "dac_amp",
]

export function TierlistContent({ initialData, categoryLabels }: TierlistContentProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  // A aba/categoria vive na URL (`?categoria=`), não em estado local — é o
  // que faz o botão/gesto de voltar do navegador (ao vir da página de
  // detalhe do periférico) restaurar a aba certa em vez de resetar pra
  // "Teclado": o histórico do navegador já guarda a URL de cada troca de aba
  // (via router.replace abaixo), então back() simplesmente relê essa URL.
  const categoryParam = searchParams.get("categoria")
  const selectedCategory: Category =
    categoryParam && CATEGORY_VALUES.includes(categoryParam as Category) ? (categoryParam as Category) : "keyboard"

  const [query, setQuery] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedPriceBand, setSelectedPriceBand] = useState<PriceBand>("all")
  const [selectedMouseShape, setSelectedMouseShape] = useState<MouseShape | "all">("all")
  const [selectedKeyboardLayout, setSelectedKeyboardLayout] = useState<KeyboardLayout | "all">("all")

  const categoryLabel = categoryLabels[selectedCategory]

  const handleCategoryChange = (category: Category) => {
    const params = new URLSearchParams(searchParams.toString())
    if (category === "keyboard") {
      params.delete("categoria")
    } else {
      params.set("categoria", category)
    }
    const queryString = params.toString()
    // replace (não push): trocar de aba não deve empilhar histórico — senão
    // "voltar" ficaria desfazendo troca de aba por troca de aba em vez de
    // sair da Tierlist. Cada troca substitui a URL atual, então o botão
    // voltar de dentro da página de detalhe do periférico cai direto na
    // última aba selecionada.
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
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
      const matchesPrice =
        selectedPriceBand === "all" ||
        (selectedPriceBand === "golpe" ? item.specs.golpe === true : getPriceBand(item.price) === selectedPriceBand)

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
