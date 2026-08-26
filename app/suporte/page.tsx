import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { SupportTicketForm } from "@/components/store/SupportTicketForm"

export const metadata: Metadata = buildMetadata({
  title: "Suporte",
  socialTitle: "Suporte: abra um chamado",
  description: "Abra um chamado de suporte da Sunano sobre um pedido, um produto da Loja ou uma dúvida da sua conta.",
  path: "/suporte",
  eyebrow: "Suporte",
  subtitle: "Atendimento de pedidos e conta",
})

export default function SuportePage() {
  return (
    <article className="mx-auto max-w-xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Suporte</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Precisa de ajuda?</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Conta pra gente o que aconteceu — se for sobre um pedido ou produto, vincule ele abaixo.
          Nossa equipe responde por aqui mesmo, e você acompanha tudo em &ldquo;Meus Tickets&rdquo;.
        </p>
      </header>

      <SupportTicketForm />
    </article>
  )
}
