import Link from "next/link"
import type { Metadata } from "next"
import {
  Building2,
  FileText,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Bird,
  LifeBuoy,
} from "lucide-react"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Central de Informações",
  description:
    "Termos de Uso, Política de Privacidade, trocas e devoluções, direitos LGPD e identificação do vendedor: todos os documentos oficiais do Sunano em um só lugar.",
  path: "/informacoes",
  eyebrow: "Institucional",
  subtitle: "Documentos e políticas",
})

type InfoCard = {
  href: string
  icon: React.ElementType
  title: string
  description: string
  /** Versão/vigência do documento, quando ele tiver uma. */
  meta?: string
}

/**
 * Cada card aponta para a URL própria do documento — nunca para uma cópia
 * dentro deste hub. Duplicar texto legal cria versões divergentes, e o aceite
 * no cadastro/checkout precisa referenciar o documento específico
 * (LGPD Art. 8º; CDC Art. 46).
 */
const DOCUMENTS: InfoCard[] = [
  {
    href: "/termos",
    icon: FileText,
    title: "Termos de Uso",
    description:
      "Regras da plataforma: conta, comunidade, sistema de Aura, loja e responsabilidades de cada parte.",
    meta: "Versão 2026-08.3",
  },
  {
    href: "/privacidade",
    icon: ShieldCheck,
    title: "Política de Privacidade",
    description:
      "Quais dados tratamos, para quê, com quem compartilhamos, por quanto tempo guardamos e como pedir exclusão.",
    meta: "Versão 2026-09",
  },
  {
    href: "/trocas-e-devolucoes",
    icon: PackageOpen,
    title: "Trocas, Devoluções e Garantia",
    description:
      "Direito de arrependimento de 7 dias, produto com defeito, garantia, reembolso e como abrir um chamado.",
    meta: "Versão 2026-09",
  },
  {
    href: "/privacidade#seus-direitos",
    icon: UserCheck,
    title: "Seus direitos LGPD",
    description:
      "Acesso, correção, portabilidade e exclusão dos seus dados pessoais, e como exercer cada um deles.",
    meta: "Lei 13.709/2018 · Art. 18",
  },
  {
    href: "/informacoes/central-de-aura",
    icon: Sparkles,
    title: "Central de Aura",
    description:
      "Como funciona a Aura: todas as formas de ganhar e gastar, o multiplicador de Ofensiva e VIP, e os limites de reações.",
  },
  {
    href: "/informacoes/trust-factor",
    icon: Bird,
    title: "Trust Factor",
    description:
      "A medida de confiança da sua conta: o que aumenta, o que diminui, as cinco faixas, como uma penalidade se recupera e o que ela libera — como os produtos físicos da Central de Aura.",
  },
  {
    href: "/quem-somos",
    icon: Building2,
    title: "Quem Somos",
    description:
      "Identificação do vendedor e canais oficiais de atendimento, conforme o Decreto 7.962/2013.",
  },
  {
    href: "/suporte",
    icon: LifeBuoy,
    title: "Suporte e Tickets",
    description:
      "Abra um chamado sobre pedidos, trocas, garantia, conta ou qualquer outra dúvida.",
  },
]

export default function InformacoesPage() {
  return (
    <div className="mx-auto max-w-4xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Central de Informações
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Documentos e políticas do Sunano
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Aqui ficam reunidos os termos, políticas e informações oficiais da plataforma. Cada
          documento tem sua própria página, com versão e data de vigência indicadas.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {DOCUMENTS.map(({ href, icon: Icon, title, description, meta }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-muted/30"
          >
            <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary">
              <Icon className="size-[18px]" />
            </div>
            <h2 className="text-base font-semibold text-foreground group-hover:text-primary">
              {title}
            </h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            {meta ? (
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {meta}
              </p>
            ) : null}
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-border bg-muted/20 p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Fale com a gente sobre privacidade
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Para exercer direitos previstos na LGPD ou tirar dúvidas sobre tratamento de dados,
          escreva para{" "}
          <a
            href="mailto:privacidade@sunano.gg"
            className="text-primary hover:underline"
          >
            privacidade@sunano.gg
          </a>{" "}
          com o assunto <em>&ldquo;Direito LGPD: [seu direito]&rdquo;</em>. Para os demais
          assuntos, use{" "}
          <a href="mailto:contato@sunano.gg" className="text-primary hover:underline">
            contato@sunano.gg
          </a>{" "}
          ou a{" "}
          <Link href="/suporte" className="text-primary hover:underline">
            Central de Tickets
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
