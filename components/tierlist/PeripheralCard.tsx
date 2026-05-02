"use client"

import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/lib/locale-context"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES } from "@/lib/tierlist-theme"

// simple cached fetch for USD -> BRL rate to avoid repeated network calls
let usdToBrlCache: number | null = null
let usdToBrlPromise: Promise<number | null> | null = null

async function getUsdToBrlRate(): Promise<number | null> {
  if (usdToBrlCache) return usdToBrlCache
  if (usdToBrlPromise) return usdToBrlPromise

  usdToBrlPromise = fetch("https://api.exchangerate.host/latest?base=USD&symbols=BRL")
    .then((res) => res.json())
    .then((json) => {
      const rate = json?.rates?.BRL ? Number(json.rates.BRL) : null
      usdToBrlCache = rate
      usdToBrlPromise = null
      return rate
    })
    .catch(() => {
      usdToBrlPromise = null
      return null
    })

  return usdToBrlPromise
}

type Tag = "competitive" | "versatile" | "value" | "comfort"
type Tier = "T0" | "T0.5" | "T1" | "T2"

interface PeripheralCardProps {
  id: string
  name: string
  brand: string
  image_url: string | null
  price: number
  tier: Tier
  category: string
  tags: Tag[]
  specs: {
    mouseShape?: "symmetrical" | "ergonomic"
    keyboardLayout?: string
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: "cloth" | "hybrid" | "glass"
    driver?: string
    profile?: string
  }
  // Extended ratings (simulating the chart from briefing)
  ratings?: {
    performance: number
    build: number
    value: number
    software?: number
    qc?: number
  }
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function RatingStars({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3",
            i < rating ? "fill-amber-400 text-amber-400" : "fill-muted-foreground/40 text-muted-foreground/40"
          )}
        />
      ))}
    </div>
  )
}

function getSpecLine(item: PeripheralCardProps) {
  const parts: string[] = []
  if (item.specs.connectivity) parts.push(formatLabel(item.specs.connectivity))
  if (item.specs.size) parts.push(formatLabel(item.specs.size))
  if (item.specs.driver) parts.push(item.specs.driver)
  if (item.specs.profile) parts.push(item.specs.profile)
  if (item.specs.mouseShape) parts.push(formatLabel(item.specs.mouseShape))
  if (item.specs.keyboardLayout) parts.push(item.specs.keyboardLayout.toUpperCase())
  if (item.specs.surface) parts.push(formatLabel(item.specs.surface))
  return parts.slice(0, 3).join(" / ")
}

function getAllSpecs(item: PeripheralCardProps, isEnglish: boolean): Array<{ label: string; value: string }> {
  const specs: Array<{ label: string; value: string }> = []
  
  if (item.specs.connectivity) specs.push({ label: isEnglish ? "Connectivity" : "Conectividade", value: formatLabel(item.specs.connectivity) })
  if (item.specs.size) specs.push({ label: isEnglish ? "Size" : "Tamanho", value: formatLabel(item.specs.size) })
  if (item.specs.driver) specs.push({ label: isEnglish ? "Sensor" : "Sensor", value: item.specs.driver })
  if (item.specs.profile) specs.push({ label: isEnglish ? "Profile" : "Perfil", value: item.specs.profile })
  if (item.specs.mouseShape) specs.push({ label: isEnglish ? "Shape" : "Forma", value: formatLabel(item.specs.mouseShape) })
  if (item.specs.keyboardLayout) specs.push({ label: "Layout", value: item.specs.keyboardLayout.toUpperCase() })
  if (item.specs.surface) specs.push({ label: isEnglish ? "Surface" : "Superfície", value: formatLabel(item.specs.surface) })
  
  return specs
}

export function PeripheralCard({ ...item }: PeripheralCardProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const tierStyle = CARD_TIER_STYLES[item.tier]
  const primaryTag = item.tags[0]
  const tagStyle = primaryTag ? CARD_TAG_STYLES[primaryTag] : CARD_TAG_STYLES.versatile
  
  // Default ratings if not provided
  const ratings = item.ratings || {
    performance: Math.floor(Math.random() * 2) + 3,
    build: Math.floor(Math.random() * 2) + 3,
    value: Math.floor(Math.random() * 2) + 3,
  }

  const [displayPrice, setDisplayPrice] = useState<string>(() => {
    // initial formatting (no conversion until effect runs)
    const currency = isEnglish ? "USD" : "BRL"
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(item.price)
    } catch (e) {
      return `${isEnglish ? "$" : "R$"}${item.price}`
    }
  })

  useEffect(() => {
    let mounted = true

    async function resolvePrice() {
      const currency = isEnglish ? "USD" : "BRL"
      let value = item.price

      if (!isEnglish) {
        // convert USD -> BRL using cached fetch
        try {
          const rate = await getUsdToBrlRate()
          if (rate) value = Number((item.price * rate).toFixed(2))
        } catch (e) {
          // fallback: keep USD value
        }
      }

      if (!mounted) return

      try {
        const formatted = new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)
        setDisplayPrice(formatted)
      } catch (e) {
        setDisplayPrice(`${isEnglish ? "$" : "R$"}${value}`)
      }
    }

    resolvePrice()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, item.price])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group cursor-pointer h-32 w-24 flex flex-col items-center justify-start">
          {/* Card Container - Fixed Height */}
          <div className="relative w-20 h-20">
            {/* Avatar/Image */}
            <div className={cn(
              "grid size-20 place-items-center overflow-hidden rounded-lg text-3xl font-black shadow-lg relative",
              tierStyle.bg,
              tierStyle.text,
            )}>
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={item.name}
                  className="h-full w-full object-cover"
                  src={item.image_url}
                />
              ) : (
                item.brand.slice(0, 2).toUpperCase()
              )}
              
              {/* Price Tag - Top Right */}
              <Badge className="absolute top-0 right-0 rounded-sm h-5 px-1.5 py-0.5 m-1 text-[10px]" variant="secondary">
                {displayPrice}
              </Badge>
            </div>
          </div>

          {/* Name Below - Fixed Space */}
          <div className="pt-3 text-center flex-1 w-full flex flex-col justify-start">
            <h3 className="text-xs font-bold text-foreground leading-tight line-clamp-2">
              {item.name}
            </h3>
            <p className="text-[9px] font-medium text-muted-foreground">
              {item.brand}
            </p>
          </div>
        </div>
      </TooltipTrigger>

      <TooltipContent
        className="flex flex-col rounded-lg border border-border bg-popover/95 p-5 shadow-xl backdrop-blur-md max-w-xs"
        sideOffset={12}
        side="bottom"
        align="center"
      >
        {/* Header - Centered */}
        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            "grid size-12 place-items-center overflow-hidden rounded-lg text-base font-bold shadow-lg",
            tierStyle.bg,
            tierStyle.text,
          )}>
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={item.name}
                className="h-full w-full object-cover"
                src={item.image_url}
              />
            ) : (
              item.brand.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="text-center">
            <h4 className="text-sm font-bold text-foreground">{item.name}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{item.brand}</p>
          </div>
            <div className="flex items-center gap-2">
            <span className={cn(
              "rounded-md px-2 py-1 text-[10px] font-bold",
              tierStyle.bg,
              tierStyle.text,
            )}>
              {item.tier}
            </span>
            <span className="text-sm font-bold text-emerald-400">{displayPrice}</span>
          </div>
        </div>

        {/* Tags - Vertical */}
        <div className="mb-4 flex flex-col items-center">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2.5">{isEnglish ? "Features" : "Características"}</p>
          <div className="flex gap-2">
            {item.tags.map((tag) => {
              const style = CARD_TAG_STYLES[tag]
              return (
                <span
                  key={tag}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase text-center block",
                    style.bg,
                    style.text,
                    style.border
                  )}
                >
                  {formatLabel(tag)}
                </span>
              )
            })}
          </div>
        </div>

        {/* Specifications - Vertical */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2.5">{isEnglish ? "Specifications" : "Especificações"}</p>
          <div className="grid grid-cols-2 gap-2.5">
            {getAllSpecs(item, isEnglish).slice(0, 4).map((spec) => (
              <div key={spec.label} className="bg-muted/30 rounded-lg p-2.5 border border-border">
                <p className="text-[9px] text-muted-foreground font-medium mb-1">{spec.label}</p>
                <p className="text-sm font-bold text-foreground">{spec.value}</p>
              </div>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
