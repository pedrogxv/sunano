"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  TRUST_LEVEL_STYLE,
  TRUST_STATUS_LABEL,
  trustLevelLabel,
  trustLevelMeta,
  type TrustLevel,
  type TrustStatus,
} from "@/lib/trust-factor"
import { TrustSeal } from "@/components/ui/TrustBadge"

/** Rota canônica da explicação. Só existe UMA (ver `TrustFactorFaqSection`). */
const TRUST_FAQ_HREF = "/informacoes/trust-factor"

/**
 * Selo do Trust Factor com explicação — a forma PÚBLICA do selo em perfil.
 *
 * Por que existe, e por que não é a pílula: o Trust aparecia no cabeçalho do
 * perfil como pílula ("REGULAR", com contorno) enquanto a página explicativa
 * desenhava o disco com anel e a calopsita preenchida. Eram DOIS símbolos para
 * o mesmo sistema — a pessoa via um selo na escala do FAQ e outro no próprio
 * perfil, e não os ligava. O desenho canônico é o do explicativo (`TrustSeal`);
 * é ele que aparece aqui.
 *
 * Também não é LINK: a pílula navegava no clique, então quem clicasse por
 * curiosidade era jogado para fora do perfil sem pedir. Aqui o selo abre um
 * balão que explica a faixa, e a ida para o FAQ é uma AÇÃO explícita
 * ("Ver sobre o Trust Factor") dentro dele.
 *
 * TAMANHO: no cabeçalho do perfil é `xs` — o disco de 24px, a mesma escala do
 * `EditNameButton` ao lado. O selo grande (`md`, 64px) é para onde o Trust é o
 * ASSUNTO da área (FAQ, trava do prêmio físico); no cabeçalho ele competia com
 * a foto de perfil logo acima.
 *
 * O balão é `Tooltip` do Radix: abre no hover no desktop e no toque/foco no
 * mobile (o gatilho é um `<button>`), e o conteúdo é focável
 * (`disableHoverableContent` desligado) para o link dentro dele ser clicável.
 */
export function TrustSealButton({
  level,
  status = "active",
  size = "md",
  /** Nome da faixa abaixo do disco. No cabeçalho do perfil o balão já diz. */
  showLabel = false,
  className,
}: {
  level: TrustLevel
  status?: TrustStatus
  size?: "xs" | "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}) {
  const restricted = status === "restricted" || status === "blocked"
  const style = TRUST_LEVEL_STYLE[level]
  const label = restricted ? TRUST_STATUS_LABEL[status] : trustLevelLabel(level)
  const description = restricted
    ? "Conta em análise pela equipe. Funções sensíveis ficam bloqueadas até a revisão."
    : trustLevelMeta(level).description

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Trust Factor: ${label}. Ver explicação.`}
          className={cn(
            "rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className
          )}
        >
          <TrustSeal
            level={level}
            status={status}
            size={size}
            showLabel={showLabel}
            describedByParent
          />
        </button>
      </TooltipTrigger>

      {/* Card claro do tooltip padrão trocado por superfície de popover: aqui
          o balão tem texto corrido e um link, não um rótulo de uma linha. */}
      <TooltipContent
        side="bottom"
        sideOffset={8}
        className="w-64 items-stretch gap-2 bg-popover p-3 text-left text-popover-foreground ring-1 ring-border"
        arrowClassName="bg-popover fill-popover"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Trust Factor
          </span>
          <span
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider",
              restricted ? "text-orange-400" : style.text
            )}
          >
            {label}
          </span>
        </div>

        <p className="text-left text-xs leading-relaxed text-muted-foreground">{description}</p>

        <p className="text-left text-[11px] leading-relaxed text-muted-foreground/70">
          Mede o comportamento da conta, não a participação — é um eixo separado da Aura.
        </p>

        <Link
          href={TRUST_FAQ_HREF}
          className="mt-0.5 inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Ver sobre o Trust Factor
          <ArrowRight className="size-3" />
        </Link>
      </TooltipContent>
    </Tooltip>
  )
}
