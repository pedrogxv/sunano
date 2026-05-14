"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import BoxLoader from "@/components/ui/box-loader"
import { StoreProductForm } from "../form"

interface StoreProduct {
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
  is_active: boolean
}

export default function EditProductPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<StoreProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/store/products/${id}`)
        const data = (await res.json()) as { product?: StoreProduct; error?: string }
        if (!res.ok || !data.product) throw new Error(data.error ?? "Produto não encontrado")
        setProduct(data.product)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <BoxLoader />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <p className="text-sm text-red-400">{error ?? "Produto não encontrado"}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Editar produto</h1>
        <p className="mt-1 text-sm text-slate-400">{product.name}</p>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-card p-6">
        <StoreProductForm
          product={product}
          onSuccess={() => router.push("/admin/store")}
          onCancel={() => router.push("/admin/store")}
        />
      </div>
    </div>
  )
}
