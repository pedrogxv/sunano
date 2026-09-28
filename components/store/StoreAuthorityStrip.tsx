import Link from "next/link"
import { ArrowRight, BadgeCheck, MessageSquareQuote, PackageCheck, type LucideIcon } from "lucide-react"

type AuthorityItem = {
  icon: LucideIcon
  title: string
  description: string
  /** Cor do ícone e do respiro do quadrado: um tom por argumento. */
  tint: string
  href?: string
  linkLabel?: string
}

const AUTHORITY_ITEMS: AuthorityItem[] = [
  {
    icon: PackageCheck,
    title: "Produtos Selecionados",
    description: "Só entra na loja o que a gente usaria no próprio setup.",
    tint: "oklch(0.75 0.15 160)",
  },
  {
    icon: MessageSquareQuote,
    title: "Reviews Honestos",
    description: "Prós e contras de verdade, de quem testa periférico todo dia.",
    tint: "oklch(0.78 0.14 85)",
    href: "/loja/avaliacoes",
    linkLabel: "Ver avaliações",
  },
  {
    icon: BadgeCheck,
    title: "Aprovados por Sunano",
    description: "Cada item passa pela bancada antes de ser anunciado.",
    tint: "oklch(0.72 0.14 250)",
  },
]

/**
 * Três argumentos de autoridade logo abaixo do Hero da Loja: por que comprar
 * aqui e não no marketplace. Texto fixo de propósito (não é campanha, é o
 * posicionamento da loja). "Reviews Honestos" leva às avaliações, que saíram
 * do menu do topo.
 *
 * Substitui a antiga TrustStrip (PIX na hora / Testado / Pedido acompanhado):
 * pagamento e entrega agora são ditos pela barra comercial, logo acima.
 */
export function StoreAuthorityStrip() {
  return (
    <section aria-label="Por que comprar na Loja Sunano">
      {/* Celular: três colunas compactas, ícone + título, sem descrição, para não empurrar a vitrine. */}
      <ul className="grid grid-cols-3 gap-2 rounded-2xl border border-[#262626] bg-card px-2 py-3 sm:hidden">
        {AUTHORITY_ITEMS.map(({ icon: Icon, title, tint, href }) => {
          const content = (
            <>
              <Icon className="size-[18px]" style={{ color: tint }} strokeWidth={1.9} />
              <span className="text-[10.5px] font-bold leading-[1.25] text-[#d4d4d4]">{title}</span>
            </>
          )
          return (
            <li key={title}>
              {href ? (
                <Link href={href} className="flex flex-col items-center gap-1.5 text-center">
                  {content}
                </Link>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center">{content}</div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Tablet/desktop: três cartões lado a lado com a explicação. */}
      <ul className="hidden grid-cols-3 gap-3 sm:grid lg:gap-4">
        {AUTHORITY_ITEMS.map(({ icon: Icon, title, description, tint, href, linkLabel }) => (
          <li
            key={title}
            className="flex items-start gap-3.5 rounded-2xl border border-[#262626] bg-card p-4 lg:p-5"
            style={{ background: `radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, ${tint} 7%, transparent), transparent 60%), var(--card)` }}
          >
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10"
              style={{ background: `color-mix(in oklab, ${tint} 16%, #0e0e0e)` }}
            >
              <Icon className="size-[22px]" style={{ color: tint }} strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-sans text-[14.5px] font-bold tracking-normal text-white">{title}</h3>
              <p className="text-[12.5px] leading-[1.5] text-[#9a9a9a]">{description}</p>
              {href && linkLabel && (
                <Link
                  href={href}
                  className="mt-0.5 inline-flex w-fit items-center gap-1 text-[12px] font-bold transition-opacity hover:opacity-80"
                  style={{ color: tint }}
                >
                  {linkLabel}
                  <ArrowRight className="size-3.5" strokeWidth={2.4} />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
