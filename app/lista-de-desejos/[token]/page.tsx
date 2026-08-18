import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Package } from "lucide-react"
import { getWishlistByShareToken } from "@/lib/server/repositories/wishlists-repository"
import { formatBRL } from "@/lib/format"
import { profilePath } from "@/lib/profile-name"
import { UserAvatar } from "@/components/ui/user-avatar"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const result = await getWishlistByShareToken(token)
  if (!result) return {}

  const ownerName = result.owner?.display_name ?? "um usuário"
  return {
    title: `${result.wishlist.name} — Lista de compras de ${ownerName}`,
    robots: { index: false, follow: false },
  }
}

export default async function PublicWishlistPage({ params }: PageProps) {
  const { token } = await params
  const result = await getWishlistByShareToken(token)
  if (!result) notFound()

  const { wishlist, owner, items } = result
  const ownerName = owner?.display_name ?? "Membro Sunano"
  const ownerSlug = owner?.display_slug ?? null

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <MiniProfileHoverCard slug={ownerSlug} side="bottom" align="start">
          {ownerSlug ? (
            <Link href={profilePath(ownerSlug)} className="shrink-0">
              <UserAvatar name={ownerName} avatarUrl={owner?.avatar_url} size={12} />
            </Link>
          ) : (
            <UserAvatar name={ownerName} avatarUrl={owner?.avatar_url} size={12} />
          )}
        </MiniProfileHoverCard>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">{wishlist.name}</h1>
          <p className="text-sm text-muted-foreground">
            Lista de compras pública de{" "}
            <MiniProfileHoverCard slug={ownerSlug} side="bottom" align="start">
              {ownerSlug ? (
                <Link href={profilePath(ownerSlug)} className="font-semibold text-foreground/80 hover:underline">
                  {ownerName}
                </Link>
              ) : (
                <span className="font-semibold text-foreground/80">{ownerName}</span>
              )}
            </MiniProfileHoverCard>
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Package className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Esta lista ainda está vazia.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) =>
            item.product ? (
              <Link
                key={item.id}
                href={`/${item.product.type === "bazaar" ? "bazar" : "loja"}/${item.product.slug}`}
                className="group block overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-foreground/20"
              >
                <div className="relative aspect-square overflow-hidden bg-muted">
                  {item.product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="size-10 text-muted-foreground" />
                    </div>
                  )}
                  {(item.product.stock === 0 || item.product.is_sold_out) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-400">
                        Esgotado
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-xs font-bold leading-snug text-foreground/90">
                    {item.product.name}
                  </h3>
                  <p className="mt-1 text-sm font-black text-emerald-400">{formatBRL(item.product.price_cents)}</p>
                </div>
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}
