import type { Metadata } from "next"
import { SuporteForm } from "@/components/store/SuporteForm"

export const metadata: Metadata = {
  title: "Suporte | Sunano",
  description: "Fale com o suporte da Sunano sobre um pedido, produto ou dúvida da Loja.",
}

export default function SuportePage() {
  return (
    <article className="mx-auto max-w-xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Suporte</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Precisa de ajuda?</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Conta pra gente o que aconteceu — se for sobre um pedido, inclua o número dele. Ao enviar,
          abrimos seu e-mail com a mensagem pronta para <strong>contato@sunano.gg</strong>.
        </p>
      </header>

      <SuporteForm />
    </article>
  )
}
