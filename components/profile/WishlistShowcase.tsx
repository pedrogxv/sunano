"use client"

import Link from "next/link"
import { useState } from "react"
import { Eye, EyeOff, Package } from "lucide-react"
import { toast } from "sonner"

import { formatBRL } from "@/lib/format"
import type { ShowcaseWishlist } from "@/lib/profile-showcase"

/**
 * Seção "Lista de Compras" do perfil — mostra a lista padrão ("Favoritos")
 * inline, como um grid de produtos, igual a `/perfil/listas`. Nasce pública
 * (ver `getOrCreateDefaultWishlist`); o dono pode escondê-la de visitantes
 * com o toggle ao lado do título, sem afetar as listas nomeadas extras
 * (essas continuam com o controle próprio em `/perfil/listas`).
 */
export function WishlistShowcase({ wishlist, isOwner }: { wishlist: ShowcaseWishlist; isOwner: boolean }) {
  const [isPublic, setIsPublic] = useState(wishlist.is_public)
  const [saving, setSaving] = useState(false)

  if (!isOwner && !isPublic) return null

  async function toggleVisibility() {
    const next = !isPublic
    setSaving(true)
    try {
      const res = await fetch(`/api/store/wishlists/${wishlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      })
      if (!res.ok) throw new Error()
      setIsPublic(next)
      toast.success(next ? "Lista de compras visível no perfil" : "Lista de compras escondida do perfil")
    } catch {
      toast.error("Erro ao atualizar visibilidade da lista")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Lista de Compras
        </h2>
        {isOwner && (
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
          >
            {isPublic ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {isPublic ? "Visível no perfil" : "Escondida do perfil"}
          </button>
        )}
      </div>

      {!isPublic && isOwner && (
        <p className="text-xs text-muted-foreground/70">
          Só você vê esta prévia — visitantes não veem a seção enquanto ela estiver escondida.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {wishlist.items.map(({ id, product }) => (
          <Link
            key={id}
            href={`/${product.type === "bazaar" ? "bazar" : "loja"}/${product.slug}`}
            className="group overflow-hidden rounded-xl border border-border bg-card/60 transition-colors hover:border-primary/40 hover:bg-card"
          >
            <div className="flex aspect-square items-center justify-center bg-muted/40">
              {product.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.images[0]} alt={product.name} className="h-full w-full object-contain p-3" />
              ) : (
                <Package className="size-8 text-muted-foreground/40" />
              )}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs font-medium text-foreground/90">{product.name}</p>
              <p className="mt-1 text-sm font-black text-emerald-400">{formatBRL(product.price_cents)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
