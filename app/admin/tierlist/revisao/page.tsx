"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { AlertCircle, Search } from "lucide-react"
import { toast } from "sonner"

import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import BoxLoader from "@/components/ui/box-loader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePageHeader } from "@/components/providers/page-header-context"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { mapTier } from "@/lib/tier-utils"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type ReviewCategoryKey = "performance" | "store" | "videoReview" | "specsComments"

interface ReviewPeripheral {
  id: string
  name: string
  brand: string
  category: Category
  tier: Tier | null
  image_url: string | null
  specs: Record<string, unknown> | null
}

const CATEGORY_ORDER: Category[] = ["mouse", "keyboard", "mousepad", "headset", "monitors", "iem", "dac_amp", "glasspad", "switches", "feet", "chairs"]

const CATEGORY_LABELS: Record<Category, { pt: string; en: string }> = {
  keyboard: { pt: "Teclado", en: "Keyboard" },
  mouse: { pt: "Mouse", en: "Mouse" },
  mousepad: { pt: "Mousepad", en: "Mousepad" },
  glasspad: { pt: "Glasspad", en: "Glasspad" },
  iem: { pt: "IEM", en: "IEM" },
  headset: { pt: "Headset", en: "Headset" },
  feet: { pt: "Feet", en: "Feet" },
  chairs: { pt: "Cadeiras", en: "Chairs" },
  monitors: { pt: "Monitores", en: "Monitors" },
  switches: { pt: "Switches", en: "Switches" },
  dac_amp: { pt: "DAC/AMP", en: "DAC/AMP" },
}

const REVIEW_CATEGORY_KEYS: ReviewCategoryKey[] = ["performance", "store", "videoReview", "specsComments"]

function getReviewCategory(specs: Record<string, unknown> | null | undefined): ReviewCategoryKey | null {
  const value = specs?.reviewCategory
  return typeof value === "string" && REVIEW_CATEGORY_KEYS.includes(value as ReviewCategoryKey) ? (value as ReviewCategoryKey) : null
}

function isApproved(specs: Record<string, unknown> | null | undefined): boolean {
  return specs?.reviewApproved === true
}

export default function TierlistReviewPage() {
  const t = useT()
  const { locale } = useLocale()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ReviewPeripheral[]>([])
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<ReviewCategoryKey | "all">("all")
  const [peripheralFilter, setPeripheralFilter] = useState<Category | "all">("all")
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  usePageHeader(t.admin.tierlistReview.pageTitle, t.admin.tierlistReview.pageDescription)

  const categoryLabels: Record<ReviewCategoryKey, string> = {
    performance: t.admin.tierlistReview.categoryPerformance,
    store: t.admin.tierlistReview.categoryStore,
    videoReview: t.admin.tierlistReview.categoryVideoReview,
    specsComments: t.admin.tierlistReview.categorySpecsComments,
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch("/api/admin/peripherals?columns=id,name,brand,category,tier,image_url,specs", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { peripherals?: ReviewPeripheral[]; error?: string } | null) => {
        if (cancelled) return
        if (!json?.peripherals) throw new Error(json?.error ?? t.admin.tierlistReview.failedToLoad)
        setItems(json.peripherals)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t.admin.tierlistReview.failedToLoad)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function patchSpecs(item: ReviewPeripheral, patch: Record<string, unknown>) {
    const nextSpecs = { ...(item.specs ?? {}), ...patch }
    const res = await fetch(`/api/admin/peripherals/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specs: nextSpecs }),
    })
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) throw new Error(json?.error ?? t.admin.tierlistReview.updateFailed)
    return nextSpecs
  }

  async function withPending(item: ReviewPeripheral, patch: Record<string, unknown>, onSuccess?: () => void) {
    setPendingIds((prev) => new Set(prev).add(item.id))
    try {
      const nextSpecs = await patchSpecs(item, patch)
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, specs: nextSpecs } : p)))
      onSuccess?.()
    } catch (err) {
      toast.error(t.admin.tierlistReview.updateFailed, {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  function handleApprove(item: ReviewPeripheral) {
    withPending(item, { reviewApproved: true }, () => {
      toast.success(t.admin.tierlistReview.approvedToast, { description: item.name })
    })
  }

  function handleSetCategory(item: ReviewPeripheral, category: ReviewCategoryKey) {
    const current = getReviewCategory(item.specs)
    withPending(item, { reviewCategory: current === category ? null : category })
  }

  const pendingItems = useMemo(() => items.filter((item) => !isApproved(item.specs)), [items])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pendingItems
    return pendingItems.filter((item) => item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q))
  }, [pendingItems, search])

  const categoryCounts = useMemo(() => {
    const counts: Record<ReviewCategoryKey, number> = { performance: 0, store: 0, videoReview: 0, specsComments: 0 }
    for (const item of searched) {
      const cat = getReviewCategory(item.specs)
      if (cat) counts[cat] += 1
    }
    return counts
  }, [searched])

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return searched
    return searched.filter((item) => getReviewCategory(item.specs) === categoryFilter)
  }, [searched, categoryFilter])

  const peripheralCounts = useMemo(() => {
    const counts = new Map<Category, number>()
    for (const item of filtered) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    }
    return counts
  }, [filtered])

  const peripheralOptions = useMemo(() => {
    const cats = CATEGORY_ORDER.filter((category) => (peripheralCounts.get(category) ?? 0) > 0)
    // Mantém a categoria selecionada visível mesmo se os outros filtros a esvaziaram.
    if (peripheralFilter !== "all" && !cats.includes(peripheralFilter)) cats.push(peripheralFilter)
    return cats
  }, [peripheralCounts, peripheralFilter])

  const finalFiltered = useMemo(() => {
    if (peripheralFilter === "all") return filtered
    return filtered.filter((item) => item.category === peripheralFilter)
  }, [filtered, peripheralFilter])

  const grouped = useMemo(() => {
    const map = new Map<Category, ReviewPeripheral[]>()
    for (const item of finalFiltered) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return CATEGORY_ORDER.filter((category) => map.has(category)).map((category) => ({
      category,
      items: map.get(category)!,
    }))
  }, [finalFiltered])

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin" parentLabel={t.admin.tierlistReview.backToDashboard} currentLabel={t.admin.tierlistReview.pageTitle} />

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs leading-5 text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setPeripheralFilter("all")}
          className={`shrink-0 rounded-full border px-3 py-2.5 text-xs font-medium transition-all md:py-1.5 ${
            peripheralFilter === "all"
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/40"
          }`}
        >
          {t.admin.tierlistReview.filterAll}
          <span className="ml-1.5 opacity-60">{filtered.length}</span>
        </button>
        {peripheralOptions.map((category) => {
          const active = peripheralFilter === category
          return (
            <button
              key={category}
              type="button"
              onClick={() => setPeripheralFilter(category)}
              className={`shrink-0 rounded-full border px-3 py-2.5 text-xs font-medium transition-all md:py-1.5 ${
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {locale === "en-US" ? CATEGORY_LABELS[category].en : CATEGORY_LABELS[category].pt}
              <span className="ml-1.5 opacity-60">{peripheralCounts.get(category) ?? 0}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.tierlistReview.searchPlaceholder}
            className="pl-9"
          />
        </div>

        <Tabs value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as ReviewCategoryKey | "all")}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">
              {t.admin.tierlistReview.filterAll}
              <span className="ml-1 text-muted-foreground/60">{searched.length}</span>
            </TabsTrigger>
            {REVIEW_CATEGORY_KEYS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {categoryLabels[key]}
                <span className="ml-1 text-muted-foreground/60">{categoryCounts[key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <BoxLoader />
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm font-medium text-foreground">
              {pendingItems.length === 0 ? t.admin.tierlistReview.allApproved : t.admin.tierlistReview.empty}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {pendingItems.length === 0 ? t.admin.tierlistReview.allApprovedDesc : t.admin.tierlistReview.emptyDesc}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items: categoryItems }) => (
            <div key={category} className="space-y-2.5">
              <h2 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {locale === "en-US" ? CATEGORY_LABELS[category].en : CATEGORY_LABELS[category].pt}
                <span className="font-normal normal-case tracking-normal text-muted-foreground/50">{categoryItems.length}</span>
              </h2>
              <div className="space-y-2">
                {categoryItems.map((item) => {
                  const tierKey = item.tier ? mapTier(item.tier) : null
                  const tierStyle = tierKey ? CARD_TIER_STYLES[tierKey] : null
                  const activeCategory = getReviewCategory(item.specs)
                  const isSaving = pendingIds.has(item.id)

                  return (
                    <Card key={item.id} className={activeCategory ? "border-amber-500/20 bg-amber-500/[0.03]" : "border-border"}>
                      <CardContent className="flex flex-wrap items-center gap-3 p-3">
                        <Link
                          href={activeCategory ? `/admin/tierlist/${item.id}?focus=${activeCategory}` : `/admin/tierlist/${item.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3"
                        >
                          <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted/40">
                            {item.image_url ? (
                              <Image src={item.image_url} alt={item.name} width={40} height={40} className="h-full w-full object-contain p-1" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] font-black text-muted-foreground">
                                {item.brand.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.brand}</p>
                          </div>
                          {tierKey && tierStyle && (
                            <Badge className={`shrink-0 text-[10px] ${tierStyle.bg} ${tierStyle.text}`} variant="outline">
                              {tierKey}
                            </Badge>
                          )}
                        </Link>

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleApprove(item)}
                          className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {t.admin.tierlistReview.approve}
                        </button>

                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          {REVIEW_CATEGORY_KEYS.map((key) => {
                            const active = activeCategory === key
                            return (
                              <button
                                key={key}
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSetCategory(item, key)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                  active
                                    ? "border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                                }`}
                              >
                                {categoryLabels[key]}
                              </button>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
