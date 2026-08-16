"use client"

import Link from "next/link"
import { ShoppingCart, Package, Bookmark, Recycle, Store } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { formatBRL } from "@/lib/format"
import { useCart } from "@/components/providers/cart-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"

interface ProductCardProps {
  id: string
  slug: string
  name: string
  price_cents: number
  stock: number
  images: string[]
  category: string | null
  brand?: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  has_variants?: boolean
  wishlisted?: boolean
  onWishlistChange?: (productId: string, wishlisted: boolean) => void
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
  const { user } = useAuthUser()
  const { openLogin } = useAuthModal()
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const wishlisted = props.wishlisted ?? false
  const href = `/${props.type === "bazaar" ? "bazar" : "loja"}/${props.slug}`
  const outOfStock = props.stock === 0
  const hasVariants = props.has_variants ?? false
  const image = props.images?.[0] ?? null

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault()
    // Produto com variantes não tem variante selecionada aqui no card —
    // deixa o clique navegar normalmente pro Link e o usuário escolhe na
    // página de detalhe.
    if (hasVariants) return
    if (outOfStock) return
    add({
      productId: props.id,
      variantId: null,
      variantLabel: null,
      slug: props.slug,
      name: props.name,
      priceCents: props.price_cents,
      image,
      stock: props.stock,
      type: props.type,
      condition: props.condition,
    })
    setOpen(true)
  }

  async function handleToggleWishlist(e: React.MouseEvent) {
    e.preventDefault()
    if (wishlistLoading) return
    if (!user) {
      openLogin()
      return
    }
    setWishlistLoading(true)
    try {
      const res = await fetch("/api/store/wishlist-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: props.id }),
      })
      if (res.status === 401) {
        openLogin()
        return
      }
      const data = (await res.json()) as { wishlisted?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar")
      props.onWishlistChange?.(props.id, Boolean(data.wishlisted))
      toast.success(data.wishlisted ? "Adicionado na lista de compras" : "Removido da lista de compras")
    } catch (err) {
      toast.error("Erro ao adicionar na lista", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setWishlistLoading(false)
    }
  }

  const accentText = props.type === "bazaar" ? "text-amber-400" : "text-sky-400"
  const accentGlow = props.type === "bazaar" ? "bg-amber-400" : "bg-sky-400"
  const TypeIcon = props.type === "bazaar" ? Recycle : Store

  return (
    <Link href={href} className="group block">
      <div className={cn(
        "relative overflow-hidden rounded-2xl border transition-all duration-200",
        CARD_SURFACE,
        "hover:-translate-y-1 hover:border-border hover:bg-secondary/80 hover:shadow-xl hover:shadow-black/10",
        outOfStock && "opacity-60"
      )}>
        {/* Glow sutil na cor do tipo (Loja/Bazar), só visível no hover. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-[0.07]",
            "[mask-image:radial-gradient(120%_60%_at_50%_0%,black,transparent)]",
            accentGlow
          )}
        />

        {/* Type ribbon */}
        <div className={cn(
          "absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border px-2 py-1 shadow-sm backdrop-blur-sm",
          props.type === "bazaar"
            ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
            : "border-sky-500/40 bg-sky-500/20 text-sky-300"
        )}>
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {props.type === "bazaar" ? "♻️ Bazar" : "🛒 Loja"}
          </span>
        </div>

        {/* Wishlist quick toggle */}
        <button
          onClick={handleToggleWishlist}
          disabled={wishlistLoading}
          aria-label={wishlisted ? "Remover da lista de compras" : "Adicionar na lista de compras"}
          className={cn(
            "absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-all",
            wishlisted
              ? "border-primary/40 bg-primary/20 text-primary"
              : "border-border/60 bg-card/70 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          )}
        >
          <Bookmark className={cn("size-3.5", wishlisted && "fill-current")} />
        </button>

        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50">
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
              Esgotado
            </span>
          </div>
        )}

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={props.name}
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="size-12 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="relative z-[1] p-4 space-y-3">
          {/* Condition badge */}
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            CONDITION_STYLE[props.condition]
          )}>
            <span className={cn(
              "size-1.5 rounded-full",
              props.condition === "new" && "bg-emerald-400",
              props.condition === "opened" && "bg-amber-400",
              props.condition === "used" && "bg-orange-400"
            )} />
            {CONDITION_LABEL[props.condition]}
          </span>

          <div>
            <h3 className="flex items-start gap-1.5 line-clamp-2 text-xs font-bold uppercase tracking-wide leading-snug text-foreground/90 group-hover:text-foreground">
              <TypeIcon className={cn("mt-0.5 size-3.5 shrink-0 transition-colors duration-200", accentText)} />
              <span className="line-clamp-2">{props.name}</span>
            </h3>
            {(props.brand || props.category) && (
              <p className="mt-1 text-[10px] capitalize text-muted-foreground">
                {[props.brand, props.category].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

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
              "flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all",
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
              "hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/10",
              outOfStock && "cursor-not-allowed opacity-50 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:shadow-none"
            )}
          >
            <ShoppingCart className="size-3.5" />
            {hasVariants ? "Ver opções" : "Comprar"}
          </button>
        </div>
      </div>
    </Link>
  )
}
