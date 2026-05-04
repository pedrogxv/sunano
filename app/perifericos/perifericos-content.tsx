"use client"

import Link from "next/link"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLocale } from "@/lib/locale-context"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { cn } from "@/lib/utils"

type Category = "all" | "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset"

type PriceBand = "all" | "budget" | "mid" | "premium"

type SortKey = "recent" | "name-asc" | "name-desc" | "price-asc" | "price-desc"

type Peripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: Exclude<Category, "all">
  tier: "T0" | "T0.5" | "T1" | "T2"
  price: number
  tags: Array<"competitive" | "versatile" | "value" | "comfort">
  specs: {
    mouseShape?: "symmetrical" | "ergonomic"
    keyboardLayout?: string
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: "cloth" | "hybrid" | "glass"
    driver?: string
    profile?: string
  }
  description?: string | null
}

interface PerifericosContentProps {
  initialData: Peripheral[]
}

const CATEGORY_LABELS_PT: Record<Category, string> = {
  all: "Todas",
  keyboard: "Teclados",
  mouse: "Mouses",
  mousepad: "Mousepads",
  glasspad: "Glasspads",
  iem: "IEMs",
  headset: "Headsets",
}

const CATEGORY_LABELS_EN: Record<Category, string> = {
  all: "All",
  keyboard: "Keyboards",
  mouse: "Mice",
  mousepad: "Mousepads",
  glasspad: "Glasspads",
  iem: "IEMs",
  headset: "Headsets",
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getPriceBand(price: number): Exclude<PriceBand, "all"> {
  if (price <= 80) return "budget"
  if (price <= 160) return "mid"
  return "premium"
}

export function PerifericosContent({ initialData }: PerifericosContentProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>("all")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedPriceBand, setSelectedPriceBand] = useState<PriceBand>("all")
  const [selectedConnectivity, setSelectedConnectivity] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("recent")

  const categoryLabels = isEnglish ? CATEGORY_LABELS_EN : CATEGORY_LABELS_PT

  const availableBrands = useMemo(() => {
    const baseList = selectedCategory === "all"
      ? initialData
      : initialData.filter((item) => item.category === selectedCategory)

    return ["all", ...Array.from(new Set(baseList.map((item) => item.brand)))]
  }, [initialData, selectedCategory])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const results = initialData.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false

      const searchable = [
        item.name,
        item.brand,
        item.specs.driver ?? "",
        item.specs.profile ?? "",
        item.specs.keyboardLayout ?? "",
      ]
        .join(" ")
        .toLowerCase()

      const matchesQuery = normalizedQuery === "" || searchable.includes(normalizedQuery)
      const matchesBrand = selectedBrand === "all" || item.brand === selectedBrand
      const matchesPrice = selectedPriceBand === "all" || getPriceBand(item.price) === selectedPriceBand
      const matchesConnectivity =
        selectedConnectivity === "all" || item.specs.connectivity === selectedConnectivity

      return matchesQuery && matchesBrand && matchesPrice && matchesConnectivity
    })

    const sorted = [...results]

    switch (sortKey) {
      case "name-asc":
        sorted.sort((left, right) => left.name.localeCompare(right.name))
        break
      case "name-desc":
        sorted.sort((left, right) => right.name.localeCompare(left.name))
        break
      case "price-asc":
        sorted.sort((left, right) => left.price - right.price || left.name.localeCompare(right.name))
        break
      case "price-desc":
        sorted.sort((left, right) => right.price - left.price || left.name.localeCompare(right.name))
        break
      default:
        break
    }

    return sorted
  }, [initialData, query, selectedCategory, selectedBrand, selectedPriceBand, selectedConnectivity, sortKey])

  const activeFiltersCount = useMemo(() => {
    return [selectedBrand, selectedPriceBand, selectedConnectivity].filter((value) => value !== "all").length
      + (selectedCategory !== "all" ? 1 : 0)
      + (query.trim() ? 1 : 0)
  }, [query, selectedBrand, selectedCategory, selectedConnectivity, selectedPriceBand])

  const resetFilters = () => {
    setQuery("")
    setSelectedCategory("all")
    setSelectedBrand("all")
    setSelectedPriceBand("all")
    setSelectedConnectivity("all")
    setSortKey("recent")
  }

  const formatCurrency = (value: number) => {
    const currency = isEnglish ? "USD" : "BRL"
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)
    } catch (error) {
      return `${isEnglish ? "$" : "R$"}${value}`
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {isEnglish ? "Peripherals" : "Perifericos"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEnglish
            ? "A searchable wiki of peripherals with filters by category, brand, and price."
            : "Uma wiki pesquisavel de perifericos com filtros por categoria, marca e preco."}
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="size-4 text-primary" />
            {isEnglish ? "Search and filters" : "Busca e filtros"}
          </CardTitle>
          <CardDescription>
            {isEnglish
              ? "Find the exact model you want and compare key specs."
              : "Encontre o modelo certo e compare as principais especificacoes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={isEnglish ? "Search peripherals" : "Buscar perifericos"}
                className="h-10 border-border bg-muted/30 pl-10 text-sm placeholder:text-muted-foreground"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isEnglish ? "Search by name, brand, sensor..." : "Buscar por nome, marca, sensor..."}
                value={query}
              />
            </div>

            <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as Category)}>
              <SelectTrigger className="h-10 w-full border-border bg-muted/30">
                <SelectValue placeholder={isEnglish ? "Category" : "Categoria"} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                      {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger className="h-10 w-full border-border bg-muted/30">
                <SelectValue placeholder={isEnglish ? "Brand" : "Marca"} />
              </SelectTrigger>
              <SelectContent>
                {availableBrands.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {brand === "all" ? (isEnglish ? "All brands" : "Todas as marcas") : brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedPriceBand} onValueChange={(value) => setSelectedPriceBand(value as PriceBand)}>
              <SelectTrigger className="h-10 w-full border-border bg-muted/30">
                <SelectValue placeholder={isEnglish ? "Price" : "Preco"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "All prices" : "Todas as faixas"}</SelectItem>
                <SelectItem value="budget">{isEnglish ? "Budget (up to $80)" : "Budget (ate $80)"}</SelectItem>
                <SelectItem value="mid">{isEnglish ? "Mid ($81 - $160)" : "Mid ($81 - $160)"}</SelectItem>
                <SelectItem value="premium">{isEnglish ? "Premium ($160+)" : "Premium ($160+)"}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedConnectivity} onValueChange={setSelectedConnectivity}>
              <SelectTrigger className="h-10 w-full border-border bg-muted/30">
                <SelectValue placeholder={isEnglish ? "Connectivity" : "Conectividade"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
                <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/30 text-sm sm:w-auto">
                <SelectValue placeholder={isEnglish ? "Sort" : "Ordenar"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{isEnglish ? "Recent" : "Recentes"}</SelectItem>
                <SelectItem value="name-asc">{isEnglish ? "Name (A-Z)" : "Nome (A-Z)"}</SelectItem>
                <SelectItem value="name-desc">{isEnglish ? "Name (Z-A)" : "Nome (Z-A)"}</SelectItem>
                <SelectItem value="price-asc">{isEnglish ? "Price (low to high)" : "Preco (menor)"}</SelectItem>
                <SelectItem value="price-desc">{isEnglish ? "Price (high to low)" : "Preco (maior)"}</SelectItem>
              </SelectContent>
            </Select>

            <Badge variant="secondary" className="rounded-full bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? (isEnglish ? "item" : "item") : (isEnglish ? "items" : "itens")}
            </Badge>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
                {isEnglish ? "Clear filters" : "Limpar filtros"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isEnglish ? "No peripherals found." : "Nenhum periferico encontrado."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isEnglish ? "Try adjusting the search or filters." : "Tente ajustar a busca ou os filtros."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/perifericos/${buildPeripheralSlug(item.name, item.id)}`}
              className={cn("transition-all", "hover:-translate-y-0.5")}
            >
              <Card className="h-full border-border bg-card">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="size-14 overflow-hidden rounded-xl border border-border bg-muted/40">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={item.name} className="h-full w-full object-cover" src={item.image_url} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                          {item.brand.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <CardTitle className="text-base text-foreground">
                        {item.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {item.brand}
                      </CardDescription>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground">
                          {categoryLabels[item.category]}
                        </Badge>
                        <Badge className="bg-primary/15 text-primary text-xs">{item.tier}</Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{isEnglish ? "Price" : "Preco"}</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      item.specs.connectivity ? formatLabel(item.specs.connectivity) : null,
                      item.specs.driver ?? null,
                      item.specs.keyboardLayout ? item.specs.keyboardLayout.toUpperCase() : null,
                      item.specs.surface ? formatLabel(item.specs.surface) : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </CardContent>
                <CardFooter className="justify-between text-xs text-muted-foreground">
                  <span>{isEnglish ? "View details" : "Ver detalhes"}</span>
                  <span className="text-primary">→</span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
