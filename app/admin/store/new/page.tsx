"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { StoreProductForm } from "../form"

function NewProductPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = (searchParams.get("type") as "store" | "bazaar") ?? "store"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">
          {type === "bazaar" ? "Novo item do Bazar" : "Novo produto da Loja"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {type === "bazaar"
            ? "Adicione um produto usado/já aberto do Sunano"
            : "Adicione um produto novo à loja"}
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-card p-6">
        <StoreProductForm
          defaultType={type}
          onSuccess={() => router.push("/admin/store")}
          onCancel={() => router.push("/admin/store")}
        />
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <NewProductPage />
    </Suspense>
  )
}
