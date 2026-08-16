"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { StoreProductForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"

function NewProductPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = (searchParams.get("type") as "store" | "bazaar") ?? "store"

  usePageHeader(
    type === "bazaar" ? "Novo item do Bazar" : "Novo produto da Loja",
    type === "bazaar"
      ? "Adicione um produto usado/já aberto do Sunano."
      : "Adicione um produto novo à loja."
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackBreadcrumb
        href="/admin/store"
        parentLabel="Loja"
        currentLabel={type === "bazaar" ? "Novo item do Bazar" : "Novo produto"}
      />

      <div className="rounded-xl border border-border bg-card p-6">
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
