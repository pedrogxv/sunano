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
  // Chips compactos, o mesmo desenho dos selos do hero da Home
  // (`HeroSealsBar`): eram três cartões de ~130px de altura com explicação em
  // duas linhas, que empurravam o catálogo — o que a pessoa veio ver na
  // landing de marca — para baixo da dobra. A explicação fica numa linha
  // (inteira no `title`) e o chip inteiro é o link, quando tem.
  return (
    <section aria-label="Por que comprar na Loja Sunano">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,#000_calc(100%_-_32px),transparent)] [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:[mask-image:none]">
        {AUTHORITY_ITEMS.map(({ icon: Icon, title, description, tint, href, linkLabel }) => {
          const content = (
            <>
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `color-mix(in oklab, ${tint} 18%, #0e0e0e)` }}
              >
                <Icon className="size-[15px]" style={{ color: tint }} strokeWidth={2.1} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-bold leading-tight text-white">
                  {title}
                  {href && <ArrowRight className="size-3 shrink-0 text-white/35 transition-all group-hover/seal:translate-x-0.5 group-hover/seal:text-white" strokeWidth={2.4} />}
                </span>
                <span title={description} className="hidden truncate text-[11px] leading-snug text-[#8a8a8a] lg:block">
                  {description}
                </span>
              </span>
            </>
          )
          const className =
            "group/seal flex h-full items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 transition-colors"
          return (
            <li key={title} className="min-w-0 shrink-0 md:shrink">
              {href ? (
                <Link href={href} aria-label={`${title}: ${linkLabel ?? description}`} className={`${className} hover:border-white/15 hover:bg-white/[0.05]`}>
                  {content}
                </Link>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
