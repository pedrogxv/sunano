"use client"

import { useRouter } from "next/navigation"
import { EventForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"

export default function NewEventPage() {
  const router = useRouter()

  usePageHeader("Nova conquista", "Crie uma conquista e a medalha concedida por ela.")

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackBreadcrumb href="/admin/eventos" parentLabel="Conquistas" currentLabel="Nova conquista" />

      <div className="rounded-xl border border-border bg-card p-6">
        <EventForm
          onSuccess={() => router.push("/admin/eventos")}
          onCancel={() => router.push("/admin/eventos")}
        />
      </div>
    </div>
  )
}
