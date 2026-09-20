import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PeripheralRequestDetailView } from "@/components/peripherals/requests/PeripheralRequestDetailView"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Pedido de periférico",
  socialTitle: "Pedido de cadastro de periférico",
  description: "Acompanhe o andamento do seu pedido de cadastro de periférico na wiki da Sunano.",
  path: "/perifericos/pedidos",
  eyebrow: "Wiki",
  subtitle: "Acompanhe o seu pedido",
  noIndex: true,
})

export default async function PedidoDePerifericoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <article className="mx-auto max-w-2xl px-2 py-10 sm:px-4 md:px-6">
      <Link
        href="/perifericos/pedidos"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Meus pedidos
      </Link>

      <PeripheralRequestDetailView id={id} />
    </article>
  )
}
