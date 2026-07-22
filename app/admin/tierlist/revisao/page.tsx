"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { AlertCircle, Search } from "lucide-react"

import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import BoxLoader from "@/components/ui/box-loader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePageHeader } from "@/components/providers/page-header-context"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { mapTier } from "@/lib/tier-utils"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type ReviewFlagKey = "performance" | "store" | "videoReview" | "specsComments"

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

const REVIEW_FLAG_KEYS: ReviewFlagKey[] = ["performance", "store", "videoReview", "specsComments"]

function getReviewFlags(specs: Record<string, unknown> | null | undefined): ReviewFlagKey[] {
  const flags = specs?.reviewFlags
  if (!Array.isArray(flags)) return []
  return flags.filter((flag): flag is ReviewFlagKey => REVIEW_FLAG_KEYS.includes(flag as ReviewFlagKey))
}

export default function TierlistReviewPage() {
  const t = useT()
  const { locale } = useLocale()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ReviewPeripheral[]>([])
  const [search, setSearch] = useState("")

  usePageHeader(t.admin.tierlistReview.pageTitle, t.admin.tierlistReview.pageDescription)

  const flagLabels: Record<ReviewFlagKey, string> = {
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q))
  }, [items, search])

  const grouped = useMemo(() => {
    const map = new Map<Category, ReviewPeripheral[]>()
    for (const item of filtered) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return CATEGORY_ORDER.filter((category) => map.has(category)).map((category) => ({
      category,
      items: map.get(category)!,
    }))
  }, [filtered])

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin" parentLabel={t.admin.tierlistReview.backToDashboard} currentLabel={t.admin.tierlistReview.pageTitle} />

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs leading-5 text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.admin.tierlistReview.searchPlaceholder}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <BoxLoader />
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm font-medium text-foreground">{t.admin.tierlistReview.empty}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t.admin.tierlistReview.emptyDesc}</p>
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
                  const activeFlags = getReviewFlags(item.specs)
                  const hasFlags = activeFlags.length > 0

                  return (
                    <Card key={item.id} className={hasFlags ? "border-amber-500/20 bg-amber-500/[0.03]" : "border-border"}>
                      <CardContent className="flex flex-wrap items-center gap-3 p-3">
                        <Link href={`/admin/tierlist/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
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

                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          {REVIEW_FLAG_KEYS.map((flag) => {
                            const active = activeFlags.includes(flag)
                            return (
                              <Link
                                key={flag}
                                href={`/admin/tierlist/${item.id}?focus=${flag}`}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                  active
                                    ? "border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                                }`}
                              >
                                {flagLabels[flag]}
                              </Link>
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
