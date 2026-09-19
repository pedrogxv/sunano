import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"

import { buildMetadata } from "@/lib/seo"
import { TrustFactorFaqSection } from "@/components/aura/TrustFactorFaqSection"

export const metadata: Metadata = buildMetadata({
  title: "Trust Factor",
  description:
    "Como funciona o Trust Factor do Sunano: a medida de confiança da sua conta, o que aumenta e o que diminui, as cinco faixas, a recuperação de penalidades e o que ele libera — incluindo os produtos físicos da Central de Aura.",
  path: "/informacoes/trust-factor",
  eyebrow: "Comunidade",
  subtitle: "Como a confiança funciona",
})

/**
 * Página de referência do Trust Factor (texto genérico, sem a faixa do
 * usuário). `TrustFactorFaqSection` é a fonte única: aqui sem `currentLevel`
 * (só a regra), na Central de Aura com a faixa real de quem está logado.
 *
 * Substituiu a explicação de "conta verificada"/"nível de confiança" que vivia
 * espalhada — o FAQ da Aura, a trava do produto físico e o selo do perfil
 * agora apontam todos para cá.
 */
export default function TrustFactorInfoPage() {
  return (
    <article className="mx-auto max-w-3xl px-2 py-10 sm:px-4 md:px-6">
      <Link
        href="/informacoes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Central de Informações
      </Link>

      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Trust Factor
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Como a confiança da sua conta funciona
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          O Trust Factor é a medida de comportamento e integridade da sua conta no Sunano. Ele é
          diferente da{" "}
          <Link href="/informacoes/central-de-aura" className="text-primary hover:underline">
            Aura
          </Link>
          , que mede participação: a Aura você ganha e gasta, o Trust Factor você constrói — e ele
          não se compra. Abaixo está tudo o que o aumenta, o que o diminui, como uma penalidade se
          recupera e o que cada faixa libera.
        </p>
      </header>

      <TrustFactorFaqSection hideHeading />

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          <Link href="/informacoes" className="text-primary hover:underline">
            Central de Informações
          </Link>
          {" · "}
          <Link href="/informacoes/central-de-aura" className="text-primary hover:underline">
            Como funciona a Aura
          </Link>
        </p>
      </footer>
    </article>
  )
}
