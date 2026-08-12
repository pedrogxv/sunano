import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Package, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/stripe"
import { getMarketListingDetail } from "@/lib/server/repositories/market-repository"

export default async function MercadoListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getMarketListingDetail(id)

  if (!listing) {
    notFound()
  }

  const image = listing.images?.[0] ?? null

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/mercado"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao Mercado
      </Link>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={listing.title} className="h-full w-full object-contain p-4" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="size-14 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">{listing.title}</h1>
            <p className="mt-2 text-3xl font-black text-amber-400">{formatBRL(listing.price_cents)}</p>
          </div>

          {listing.description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{listing.description}</p>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-muted-foreground">
              A negociação e a compra acontecem na OLX, fora do Sunano. Confira o anúncio com
              atenção antes de negociar com o vendedor.
            </p>
          </div>

          <a href={listing.olx_url} target="_blank" rel="noopener noreferrer">
            <Button className="w-full gap-2">
              Ver anúncio na OLX
              <ExternalLink className="size-4" />
            </Button>
          </a>
        </div>
      </div>
    </div>
  )
}
