"use client"

import { useRouter } from "next/navigation"
import { EventForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"

export default function NewEventPage() {
  const router = useRouter()

  usePageHeader("Novo evento", "Crie um evento e a medalha concedida por ele.")

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackBreadcrumb href="/admin/eventos" parentLabel="Eventos" currentLabel="Novo evento" />

      <div className="rounded-xl border border-border bg-card p-6">
        <EventForm
          onSuccess={() => router.push("/admin/eventos")}
          onCancel={() => router.push("/admin/eventos")}
        />
      </div>
    </div>
  )
}
