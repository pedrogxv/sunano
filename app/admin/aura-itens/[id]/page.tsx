"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { AuraItemForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"
import type { AuraItemAdmin } from "@/lib/server/repositories/aura-store-repository"

export default function EditAuraItemPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<AuraItemAdmin | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/aura-itens/${id}`)
        const data = (await res.json()) as { item?: AuraItemAdmin; error?: string }
        if (!res.ok || !data.item) throw new Error(data.error ?? "Item não encontrado")
        setItem(data.item)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar"
        setError(message)
        toast.error("Erro ao carregar item", { description: message })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  usePageHeader("Editar item de Aura", item ? item.name : "Atualize os dados do item.")

  const currentLabel = item?.name ?? (loading ? "Carregando…" : "Editar item")

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackBreadcrumb href="/admin/aura-itens" parentLabel="Itens de Aura" currentLabel={currentLabel} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 py-20">
          <BoxLoader />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Carregando item…</p>
            <p className="mt-1 text-xs text-muted-foreground">Buscando dados do item de Aura.</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackBreadcrumb href="/admin/aura-itens" parentLabel="Itens de Aura" />
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
          <p className="text-sm text-red-400">{error ?? "Item não encontrado"}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackBreadcrumb href="/admin/aura-itens" parentLabel="Itens de Aura" currentLabel={item.name} />
      <div className="rounded-xl border border-border bg-card p-6">
        <AuraItemForm
          item={item}
          onSuccess={() => router.push("/admin/aura-itens")}
          onCancel={() => router.push("/admin/aura-itens")}
        />
      </div>
    </div>
  )
}
