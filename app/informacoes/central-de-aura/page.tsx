import Link from "next/link"
import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { AuraFaqSection } from "@/components/aura/AuraFaqSection"

export const metadata: Metadata = buildMetadata({
  title: "Central de Aura",
  description:
    "Como o sistema de Aura funciona no Sunano: todas as formas de ganhar e gastar Aura, o multiplicador de Ofensiva e VIP, o que não gera Aura e os limites de reações por nível de confiança.",
  path: "/informacoes/central-de-aura",
  eyebrow: "Comunidade",
  subtitle: "Como a Aura funciona",
})

/**
 * Versão de referência (texto genérico, sem os números do usuário) do FAQ que
 * antes vivia dentro da Central de Aura (`/aura`). A página `/aura` agora só
 * mantém uma chamada apontando para cá. `AuraFaqSection` é a fonte única: aqui
 * sem `streak`/`isVip` (só a regra), lá com os valores reais do usuário.
 */
export default function CentralDeAuraInfoPage() {
  return (
    <article className="mx-auto max-w-3xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Central de Aura
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Como o sistema de Aura funciona
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Aura é a moeda da comunidade do Sunano: você ganha participando e troca por itens
          exclusivos de perfil. Abaixo estão todas as formas de ganhar e gastar, o que influencia
          o multiplicador e o que não gera Aura. Para ver seu saldo, suas tarefas do dia e a loja,
          acesse a{" "}
          <Link href="/aura" className="text-primary hover:underline">
            Central de Aura
          </Link>
          .
        </p>
      </header>

      <AuraFaqSection hideHeading />

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          <Link href="/informacoes" className="text-primary hover:underline">
            Central de Informações
          </Link>
        </p>
      </footer>
    </article>
  )
}
