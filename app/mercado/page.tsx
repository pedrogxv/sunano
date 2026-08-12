import Link from "next/link"
import { Plus, Recycle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarketListingCard } from "@/components/market/MarketListingCard"
import { listActiveMarketListings } from "@/lib/server/repositories/market-repository"

export default async function MercadoPage() {
  const listings = await listActiveMarketListings()

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Mercado</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Anúncios de produtos novos e usados publicados pela comunidade. A negociação e a
            compra acontecem direto na OLX, pelo link de cada anúncio.
          </p>
        </div>
        <Link href="/mercado/novo">
          <Button className="gap-2">
            <Plus className="size-4" />
            Anunciar
          </Button>
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border py-20 text-center">
          <Recycle className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum anúncio ativo no momento.</p>
          <Link href="/mercado/novo">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Publicar o primeiro anúncio
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <MarketListingCard
              key={listing.id}
              id={listing.id}
              title={listing.title}
              price_cents={listing.price_cents}
              images={listing.images}
              created_at={listing.created_at}
            />
          ))}
        </div>
      )}
    </div>
  )
}
