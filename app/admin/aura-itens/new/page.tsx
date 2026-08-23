"use client"

import { useRouter } from "next/navigation"
import { AuraItemForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"

export default function NewAuraItemPage() {
  const router = useRouter()

  usePageHeader("Novo item de Aura", "Crie uma moldura de avatar compráveis com Aura na Central de Aura.")

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackBreadcrumb href="/admin/aura-itens" parentLabel="Itens de Aura" currentLabel="Novo item" />

      <div className="rounded-xl border border-border bg-card p-6">
        <AuraItemForm
          onSuccess={() => router.push("/admin/aura-itens")}
          onCancel={() => router.push("/admin/aura-itens")}
        />
      </div>
    </div>
  )
}
