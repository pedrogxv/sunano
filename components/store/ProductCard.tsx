"use client"

import Link from "next/link"
import { ShoppingCart, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/stripe"
import { useCart } from "@/lib/cart-context"

interface ProductCardProps {
  id: string
  slug: string
  name: string
  price_cents: number
  stock: number
  images: string[]
  category: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Emb. aberta",
  used: "Usado",
}

const CONDITION_STYLE: Record<string, string> = {
  new: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  opened: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  used: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

export function ProductCard(props: ProductCardProps) {
  const { add, setOpen } = useCart()
  const href = `/${props.type === "bazaar" ? "bazar" : "loja"}/${props.slug}`
  const outOfStock = props.stock === 0
  const image = props.images?.[0] ?? null

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault()
    if (outOfStock) return
    add({
      productId: props.id,
      slug: props.slug,
      name: props.name,
      priceCents: props.price_cents,
      image,
      stock: props.stock,
      type: props.type,
    })
    setOpen(true)
  }

  return (
    <Link href={href} className="group block">
      <div className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0e17]/80 transition-all duration-200",
        "hover:border-white/[0.18] hover:shadow-lg hover:shadow-black/40",
        outOfStock && "opacity-60"
      )}>
        {/* Bazaar ribbon */}
        {props.type === "bazaar" && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300">♻️ Bazar</span>
          </div>
        )}

        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50">
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
              Esgotado
            </span>
          </div>
        )}

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-white/[0.03]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={props.name}
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="size-12 text-slate-700" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4 space-y-3">
          {/* Condition badge */}
          {props.condition !== "new" && (
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              CONDITION_STYLE[props.condition]
            )}>
              {CONDITION_LABEL[props.condition]}
            </span>
          )}

          <div>
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-100 group-hover:text-white">
              {props.name}
            </h3>
            {props.category && (
              <p className="mt-0.5 text-[10px] capitalize text-slate-600">{props.category}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-lg font-black text-emerald-400">{formatBRL(props.price_cents)}</p>
              {props.stock > 0 && props.stock <= 3 && (
                <p className="text-[10px] text-amber-400">Últimas {props.stock} unidades!</p>
              )}
            </div>

            <button
              onClick={handleAddToCart}
              disabled={outOfStock}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-300 transition-all",
                "hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300",
                outOfStock && "cursor-not-allowed"
              )}
            >
              <ShoppingCart className="size-3.5" />
              Comprar
            </button>
          </div>
        </div>
      </div>
    </Link>
  )
}
