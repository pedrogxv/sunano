"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { StoreProductForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"
import { ProductPriceHistoryChart, type PriceHistoryPoint } from "@/components/admin/store/ProductPriceHistoryChart"

interface StoreProduct {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  promo_price_cents?: number | null
  stock: number | null
  images: string[]
  category: string | null
  brand: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  is_active: boolean
  is_sold_out: boolean
  features?: string[]
  video_url?: string | null
}

interface StoreProductSpec {
  id?: string
  label: string
  value: string
}

interface StoreProductVariant {
  id?: string
  label: string
  price_cents_override: number | null
  promo_price_cents: number | null
  stock: number | null
  color: string | null
  icon: string | null
  image_url: string | null
  images?: string[]
}

export default function EditProductPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<StoreProduct | null>(null)
  const [specs, setSpecs] = useState<StoreProductSpec[]>([])
  const [variants, setVariants] = useState<StoreProductVariant[]>([])
  const [peripheralIds, setPeripheralIds] = useState<string[]>([])
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [res, historyRes] = await Promise.all([
          fetch(`/api/admin/store/products/${id}`),
          fetch(`/api/admin/store/products/${id}/price-history`),
        ])
        const data = (await res.json()) as {
          product?: StoreProduct
          specs?: StoreProductSpec[]
          variants?: StoreProductVariant[]
          peripheralIds?: string[]
          error?: string
        }
        if (!res.ok || !data.product) throw new Error(data.error ?? "Produto não encontrado")
        setProduct(data.product)
        setSpecs(data.specs ?? [])
        setVariants(data.variants ?? [])
        setPeripheralIds(data.peripheralIds ?? [])

        if (historyRes.ok) {
          const historyData = (await historyRes.json()) as { history?: PriceHistoryPoint[] }
          setPriceHistory(historyData.history ?? [])
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar"
        setError(message)
        toast.error("Erro ao carregar produto", { description: message })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  usePageHeader(
    "Editar produto",
    product ? product.name : "Atualize as informações do produto."
  )

  const currentLabel = product?.name ?? (loading ? "Carregando…" : "Editar produto")

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <BackBreadcrumb href="/admin/store" parentLabel="Loja" currentLabel={currentLabel} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 py-20">
          <BoxLoader />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Carregando produto…</p>
            <p className="mt-1 text-xs text-muted-foreground">Buscando informações, imagens e estoque.</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <BackBreadcrumb href="/admin/store" parentLabel="Loja" />
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
          <p className="text-sm text-red-400">{error ?? "Produto não encontrado"}</p>
        </div>
      </div>
    )
  }

  const variantLabels = Object.fromEntries(
    variants.filter((v): v is StoreProductVariant & { id: string } => Boolean(v.id)).map((v) => [v.id, v.label])
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackBreadcrumb href="/admin/store" parentLabel="Loja" currentLabel={product.name} />
      <div className="rounded-xl border border-border bg-card p-6">
        <StoreProductForm
          product={product}
          initialSpecs={specs}
          initialVariants={variants}
          initialPeripheralIds={peripheralIds}
          onSuccess={() => router.push("/admin/store")}
          onCancel={() => router.push("/admin/store")}
        />
      </div>
      <ProductPriceHistoryChart history={priceHistory} variantLabels={variantLabels} />
    </div>
  )
}
