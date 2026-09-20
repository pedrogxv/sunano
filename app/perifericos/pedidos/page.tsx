import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PeripheralRequestsHub } from "@/components/peripherals/requests/PeripheralRequestsHub"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Pedir cadastro de periférico",
  socialTitle: "Pedir cadastro de periférico na wiki",
  description: "Não achou o seu periférico na wiki da Sunano? Peça o cadastro e acompanhe o andamento do pedido.",
  path: "/perifericos/pedidos",
  eyebrow: "Wiki",
  subtitle: "Peça o cadastro de um periférico",
  noIndex: true,
})

export default function PedidosDePerifericoPage() {
  return (
    <article className="mx-auto max-w-2xl px-2 py-10 sm:px-4 md:px-6">
      <Link
        href="/perifericos"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Periféricos
      </Link>

      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Wiki</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pedir cadastro de periférico</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Não achou o que procurava? Conta pra gente qual é. A equipe analisa por ordem de chegada, e você
          acompanha o pedido aqui e pelas notificações.
        </p>
      </header>

      <PeripheralRequestsHub />
    </article>
  )
}
