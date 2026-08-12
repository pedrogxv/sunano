import Link from "next/link"
import { Package } from "lucide-react"
import { formatBRL } from "@/lib/stripe"

export interface MarketListingCardData {
  id: string
  title: string
  price_cents: number
  images: string[]
  created_at: string
}

export function MarketListingCard({ id, title, price_cents, images }: MarketListingCardData) {
  const image = images?.[0] ?? null

  return (
    <Link href={`/mercado/${id}`} className="group block">
      <div className="overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/20 hover:shadow-lg hover:shadow-black/10">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={title}
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="size-12 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground/90 group-hover:text-foreground">
            {title}
          </h3>
          <p className="text-lg font-black text-amber-400">{formatBRL(price_cents)}</p>
        </div>
      </div>
    </Link>
  )
}
