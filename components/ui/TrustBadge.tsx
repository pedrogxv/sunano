import Link from "next/link"
import { Bird, ShieldAlert, ShieldQuestion } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  TRUST_LEVEL_CLASS,
  TRUST_LEVEL_STYLE,
  TRUST_STATUS_CLASS,
  TRUST_STATUS_LABEL,
  trustLevelLabel,
  trustLevelMeta,
  type TrustLevel,
  type TrustStatus,
} from "@/lib/trust-factor"

/**
 * Selo do Trust Factor — O componente central de exibição da confiança.
 *
 * **Toda** referência nova à faixa de confiança (perfil, painel, Central de
 * Aura, fila de moderação, comentário) desenha por aqui. Mesma régua de
 * `AuraIcon` e `ProfileAvatar`: ícone + cor + rótulo repetidos à mão em cada
 * tela é exatamente como o site acabou com a mesma chama em cinco tons.
 *
 * O SÍMBOLO é o pássaro (calopsita) da identidade do Sunano — o mesmo do
 * `StreakBadge`, lido como "é a mesma casa". O que separa os dois é a COR:
 * Ofensiva usa a rampa quente (âmbar→vermelho, que é o eixo da Aura) e o
 * Trust usa a rampa fria→nobre (vermelho→âmbar→sky→esmeralda→violeta), em
 * `TRUST_LEVEL_STYLE`. Trocar a paleta aqui faz o selo de confiança parecer
 * selo de ofensiva — foi assim que Ofensiva e Aura já saíram idênticas uma
 * vez, e ninguém sabia de qual placar a moldura era.
 *
 * REGRA INEGOCIÁVEL: nunca exiba a PONTUAÇÃO ao usuário comum. O documento é
 * explícito — "o usuário vê apenas a faixa; a pontuação exata, pesos e regras
 * detalhadas permanecem internos para reduzir manipulação". O número só
 * aparece com `showScore`, que é para o painel administrativo. Vazar a nota na
 * tela pública entrega o gradiente que um farmador precisa para calibrar.
 *
 * QUATRO FORMAS, UM SÓ SISTEMA:
 *   `TrustBadge`       — pílula compacta (listagem, mini perfil, admin);
 *   `TrustBadgeLabeled`— pílula + rótulo "Trust Factor" (quando falta contexto);
 *   `TrustSeal`        — selo circular com anel (escala do FAQ, vitrine, painel);
 *   `TrustSealButton`  — o selo + balão de explicação e link "Ver sobre"
 *                        (`components/ui/TrustSealButton`, cabeçalho de perfil).
 *
 * O selo circular é o desenho CANÔNICO do Trust: é ele que a página
 * explicativa usa na escala das cinco faixas. Onde a pessoa vê a própria
 * confiança (cabeçalho do perfil), o símbolo tem de ser esse mesmo — com a
 * pílula ali, o site mostrava dois desenhos para um sistema só e ninguém
 * ligava um ao outro. A pílula segue certa onde o selo não cabe: linha de
 * listagem, tabela do painel, cartão de mini perfil.
 */

const SIZE_CLASS = {
  sm: "gap-1 px-1.5 py-0.5 text-[10px]",
  md: "gap-1.5 px-2 py-0.5 text-[11px]",
  lg: "gap-1.5 px-2.5 py-1 text-xs",
} as const

const ICON_CLASS = {
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
} as const

/**
 * Conta restrita/bloqueada mostra o ESTADO, não a faixa: dizer "Excelente"
 * numa conta sob análise de fraude é o sinal errado, mesmo que a nota ainda
 * esteja alta — e é justamente o caso que o §9 do documento descreve.
 */
function isRestricted(status: TrustStatus) {
  return status === "restricted" || status === "blocked"
}

export function TrustBadge({
  level,
  status = "active",
  score,
  size = "md",
  showScore = false,
  /** Vira link para o FAQ. Liga onde a pessoa pode querer entender a faixa. */
  href,
  className,
}: {
  level: TrustLevel
  status?: TrustStatus
  /** Só usado com `showScore` — painel administrativo. */
  score?: number
  size?: keyof typeof SIZE_CLASS
  /** Exibe a pontuação exata. SOMENTE no painel administrativo. */
  showScore?: boolean
  href?: string
  className?: string
}) {
  const restricted = isRestricted(status)
  const style = TRUST_LEVEL_STYLE[level]

  const Icon = restricted ? ShieldAlert : status === "watch" ? ShieldQuestion : Bird
  const label = restricted ? TRUST_STATUS_LABEL[status] : trustLevelLabel(level)
  const tone = restricted ? TRUST_STATUS_CLASS[status] : TRUST_LEVEL_CLASS[level]

  const title = restricted
    ? "Conta em análise pela equipe — funções sensíveis ficam bloqueadas."
    : `Trust Factor: ${label} — ${trustLevelMeta(level).description}`

  const content = (
    <>
      <Icon
        className={cn(ICON_CLASS[size], !restricted && style.glow)}
        strokeWidth={2.4}
        // A calopsita fica preenchida nas faixas de cima: o selo "encorpa"
        // conforme sobe, então a diferença se lê sem depender só da cor
        // (daltonismo) nem do rótulo.
        fill={!restricted && (level === "very_good" || level === "excellent") ? "currentColor" : "none"}
      />
      <span>{label}</span>
      {showScore && typeof score === "number" && (
        <span className="font-mono opacity-70">{score}</span>
      )}
    </>
  )

  const classes = cn(
    "inline-flex items-center rounded-full border font-semibold",
    SIZE_CLASS[size],
    tone,
    href && "transition-opacity hover:opacity-80",
    className
  )

  if (href) {
    return (
      <Link href={href} title={title} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <span title={title} className={classes}>
      {content}
    </span>
  )
}

/**
 * Pílula com o rótulo "Trust Factor" na frente — para quando o selo aparece
 * solto e o contexto não deixa claro o que a faixa significa. Em tabela ou
 * lista onde a coluna já diz, use `TrustBadge` puro.
 */
export function TrustBadgeLabeled({
  level,
  status = "active",
  size = "md",
  href,
  className,
}: {
  level: TrustLevel
  status?: TrustStatus
  size?: keyof typeof SIZE_CLASS
  href?: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-[10px] font-medium text-muted-foreground">Trust Factor</span>
      <TrustBadge level={level} status={status} size={size} href={href} />
    </span>
  )
}

const SEAL_SIZE = {
  /**
   * Escala do `EditNameButton` (`size-6` + ícone `size-3`), para o selo que
   * fica AO LADO DO NOME no cabeçalho do perfil. É o único tamanho que cabe
   * ali sem competir com o nome nem com a foto logo acima.
   */
  xs: { box: "size-6", icon: "size-3", ring: "p-[1.5px]" },
  sm: { box: "size-12", icon: "size-5", ring: "p-[2px]" },
  md: { box: "size-16", icon: "size-7", ring: "p-[2.5px]" },
  lg: { box: "size-20", icon: "size-9", ring: "p-[3px]" },
} as const

/**
 * Selo GRANDE e circular — a forma de vitrine do Trust Factor.
 *
 * O anel é um elemento ATRÁS do disco (gradiente cônico), com o raio casando
 * com o do recorte. Nunca desenhe esse anel com `border-image`: ela **ignora
 * `border-radius` por especificação** e o gradiente sai como um retângulo de
 * canto vivo por cima — foi exatamente esse o bug da "moldura fora da borda"
 * no perfil (ver `ProfileAvatar`).
 *
 * É o desenho CANÔNICO do Trust — o mesmo da escala de faixas no explicativo.
 * Use onde o Trust é o ASSUNTO da área (o bloco do FAQ, a trava do prêmio
 * físico, a ficha no painel) e no cabeçalho do perfil, ali pela casca
 * `TrustSealButton`, que acrescenta a explicação. Não o ponha na MESMA linha
 * do nome nem na fileira das outras pílulas: um disco ao lado do nome compete
 * com o avatar, e no meio das badges ele vira mais um contador. Em listagem e
 * tabela, onde não há eixo próprio para ele, a pílula (`TrustBadge`) segue
 * sendo a forma certa.
 */
export function TrustSeal({
  level,
  status = "active",
  size = "md",
  showLabel = true,
  /**
   * Desliga o `title` nativo. Use quando quem envolve o selo já explica a
   * faixa (é o caso do `TrustSealButton`): com os dois, o balão do navegador
   * sobe por cima do balão da página dizendo a mesma coisa.
   */
  describedByParent = false,
  className,
}: {
  level: TrustLevel
  status?: TrustStatus
  size?: keyof typeof SEAL_SIZE
  /** Nome da faixa abaixo do disco. */
  showLabel?: boolean
  describedByParent?: boolean
  className?: string
}) {
  const restricted = isRestricted(status)
  const style = TRUST_LEVEL_STYLE[level]
  const dimensions = SEAL_SIZE[size]

  const Icon = restricted ? ShieldAlert : status === "watch" ? ShieldQuestion : Bird
  const label = restricted ? TRUST_STATUS_LABEL[status] : trustLevelLabel(level)

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div
        title={
          describedByParent
            ? undefined
            : restricted
              ? "Conta em análise pela equipe."
              : `Trust Factor: ${label} — ${trustLevelMeta(level).description}`
        }
        className={cn(
          "rounded-full bg-gradient-to-br",
          dimensions.ring,
          restricted ? "from-orange-500/60 to-orange-500/5" : style.ring
        )}
      >
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full border bg-card",
            dimensions.box,
            restricted ? "border-orange-500/40" : style.border
          )}
        >
          <Icon
            className={cn(dimensions.icon, restricted ? "text-orange-400" : style.text, !restricted && style.glow)}
            strokeWidth={1.8}
            fill={
              !restricted && (level === "very_good" || level === "excellent") ? "currentColor" : "none"
            }
          />
        </div>
      </div>

      {showLabel && (
        <span
          className={cn(
            "text-[11px] font-bold uppercase tracking-wider",
            restricted ? "text-orange-400" : style.text
          )}
        >
          {label}
        </span>
      )}
    </div>
  )
}
