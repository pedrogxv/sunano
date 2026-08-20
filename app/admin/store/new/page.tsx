"use client"

import { useRouter } from "next/navigation"
import { StoreProductForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"

export default function NewProductPage() {
  const router = useRouter()

  usePageHeader("Novo produto da Loja", "Adicione um produto novo à loja.")

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackBreadcrumb href="/admin/store" parentLabel="Loja" currentLabel="Novo produto" />

      <div className="rounded-xl border border-border bg-card p-6">
        <StoreProductForm
          onSuccess={() => router.push("/admin/store")}
          onCancel={() => router.push("/admin/store")}
        />
      </div>
    </div>
  )
}
