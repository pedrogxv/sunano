"use client"

import { use } from "react"

import { StoreCampaignEditor } from "@/components/admin/store/StoreCampaignEditor"
import { usePageHeader } from "@/components/providers/page-header-context"

/** `/admin/store/campanhas/nova` cria; qualquer outro segmento é o id de uma campanha. */
export default function AdminStoreCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isNew = id === "nova"

  usePageHeader(
    isNew ? "Nova campanha" : "Editar campanha",
    "Tema, período e produtos de uma campanha sazonal da Loja (Black Friday, Natal, Páscoa)."
  )

  return <StoreCampaignEditor key={id} campaignId={isNew ? null : id} />
}
