"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { AlertCircle, CheckCircle2, Pencil } from "lucide-react"

import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import BoxLoader from "@/components/ui/box-loader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePageHeader } from "@/components/providers/page-header-context"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { mapTier } from "@/lib/tier-utils"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"

interface PendingPeripheral {
  id: string
  name: string
  brand: string
  category: Category
  tier: Tier | null
  image_url: string | null
}

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

export default function TierlistReviewPage() {
  const t = useT()
  const { locale } = useLocale()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<PendingPeripheral[]>([])

  usePageHeader(t.admin.tierlistReview.pageTitle, t.admin.tierlistReview.pageDescription)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch("/api/admin/peripherals?columns=id,name,brand,category,tier,image_url,specs", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { peripherals?: (PendingPeripheral & { specs?: Record<string, unknown> })[]; error?: string } | null) => {
        if (cancelled) return
        if (!json?.peripherals) throw new Error(json?.error ?? t.admin.tierlistReview.failedToLoad)
        setItems(json.peripherals.filter((p) => Boolean(p.specs?.needsReview)))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t.admin.tierlistReview.failedToLoad)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin" parentLabel={t.admin.tierlistReview.backToDashboard} currentLabel={t.admin.tierlistReview.pageTitle} />

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs leading-5 text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <BoxLoader />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-sm font-medium text-foreground">{t.admin.tierlistReview.empty}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t.admin.tierlistReview.emptyDesc}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t.admin.tierlistReview.itemsCount(items.length)}
          </p>
          <div className="space-y-2">
            {items.map((item) => {
              const tierKey = item.tier ? mapTier(item.tier) : null
              const tierStyle = tierKey ? CARD_TIER_STYLES[tierKey] : null
              const categoryLabel = locale === "en-US" ? CATEGORY_LABELS[item.category]?.en : CATEGORY_LABELS[item.category]?.pt

              return (
                <Link key={item.id} href={`/admin/tierlist/${item.id}`} className="group block">
                  <Card className="border-amber-500/20 bg-amber-500/[0.03] transition-colors hover:border-amber-400/40 hover:bg-amber-500/[0.06]">
                    <CardContent className="flex items-center gap-4 p-3.5">
                      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted/40">
                        {item.image_url ? (
                          <Image src={item.image_url} alt={item.name} width={48} height={48} className="h-full w-full object-contain p-1" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] font-black text-muted-foreground">
                            {item.brand.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.brand}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {categoryLabel && (
                          <Badge variant="outline" className="text-[10px]">
                            {categoryLabel}
                          </Badge>
                        )}
                        {tierKey && tierStyle && (
                          <Badge className={`text-[10px] ${tierStyle.bg} ${tierStyle.text}`} variant="outline">
                            {tierKey}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-300 opacity-0 transition-opacity group-hover:opacity-100">
                          <Pencil className="size-3.5" />
                          {t.admin.tierlistReview.editButton}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
