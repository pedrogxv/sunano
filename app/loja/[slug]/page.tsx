"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, ShoppingCart, Package, Shield } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CartButton, CartDrawer } from "@/components/store/CartDrawer"
import { useCart } from "@/lib/cart-context"
import { formatBRL } from "@/lib/stripe"
import { cn } from "@/lib/utils"
import BoxLoader from "@/components/ui/box-loader"
import { createClient } from "@supabase/supabase-js"

interface Product {
  id: string
  slug: string
  name: string
  description: string | null
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
  opened: "Embalagem aberta",
  used: "Usado",
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>()
  const { add, setOpen } = useCart()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data } = await supabase
        .from("store_products")
        .select("id, slug, name, description, price_cents, stock, images, category, type, condition, condition_notes")
        .eq("slug", slug)
        .eq("type", "store")
        .eq("is_active", true)
        .single()

      setProduct(data ?? null)
      setLoading(false)
    }
    load()
  }, [slug])

  function handleAddToCart() {
    if (!product || product.stock === 0) return
    add({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      priceCents: product.price_cents,
      image: product.images?.[0] ?? null,
      stock: product.stock,
      type: product.type,
    })
    setAdded(true)
    setOpen(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <BoxLoader />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <Package className="size-12 text-slate-700" />
        <p className="text-slate-400">Produto não encontrado</p>
        <Link href="/loja">
          <Button variant="outline" size="sm">← Voltar à loja</Button>
        </Link>
      </div>
    )
  }

  const outOfStock = product.stock === 0
  const mainImage = product.images?.[selectedImage] ?? null

  return (
    <>
      <CartDrawer />

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/loja"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Voltar à Loja
          </Link>
          <CartButton />
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Images */}
          <div className="space-y-3">
            <div className="aspect-square overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.03]">
              {mainImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mainImage}
                  alt={product.name}
                  className="h-full w-full object-contain p-6"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="size-16 text-slate-700" />
                </div>
              )}
            </div>

            {product.images.length > 1 && (
              <div className="flex gap-2">
                {product.images.map((img, idx) => (
                  <button
                    key={img}
                    onClick={() => setSelectedImage(idx)}
                    className={cn(
                      "size-14 overflow-hidden rounded-lg border-2 transition-all",
                      idx === selectedImage
                        ? "border-emerald-500/60"
                        : "border-white/[0.08] hover:border-white/[0.20]"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-5">
            {product.condition !== "new" && (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-300">
                {CONDITION_LABEL[product.condition]}
              </span>
            )}

            <div>
              <h1 className="text-2xl font-black text-slate-50">{product.name}</h1>
              {product.category && (
                <p className="mt-1 text-sm capitalize text-slate-500">{product.category}</p>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black text-emerald-400">
                {formatBRL(product.price_cents)}
              </span>
              {product.stock > 0 && product.stock <= 5 && (
                <span className="text-xs font-semibold text-amber-400">
                  Últimas {product.stock} unidades
                </span>
              )}
            </div>

            {product.description && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-sm leading-relaxed text-slate-400 whitespace-pre-wrap">
                  {product.description}
                </p>
              </div>
            )}

            {/* Add to cart */}
            <div className="space-y-3">
              <Button
                className={cn(
                  "w-full gap-2 text-base font-bold py-6",
                  added
                    ? "bg-emerald-600 text-white"
                    : outOfStock
                      ? "cursor-not-allowed opacity-50"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                )}
                onClick={handleAddToCart}
                disabled={outOfStock}
              >
                <ShoppingCart className="size-5" />
                {outOfStock ? "Produto esgotado" : added ? "Adicionado! ✓" : "Adicionar ao carrinho"}
              </Button>

              <p className="text-center text-xs text-slate-600">
                Pagamento seguro via Stripe · Cartão ou PIX
              </p>
            </div>

            {/* Trust */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Shield className="size-3.5 text-emerald-500/60" />
                Pagamento 100% seguro processado pela Stripe
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Package className="size-3.5 text-blue-500/60" />
                Envio com rastreamento para todo o Brasil
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
