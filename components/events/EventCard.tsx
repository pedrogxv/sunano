"use client"

import Image from "next/image"
import Link from "next/link"
import { Award, CheckCircle2, Crown, Flame, Loader2, Lock } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  MEDAL_RARITY_BAR,
  MEDAL_RARITY_GLOW,
  MEDAL_RARITY_HOLO,
  MEDAL_RARITY_LABEL,
  MEDAL_RARITY_SOLID,
  MEDAL_RARITY_STYLES,
  MEDAL_RARITY_SYMBOL,
} from "@/lib/profile-showcase"
import { EVENT_CRITERIA_SHORT_LABEL, type EventDisplay } from "@/lib/events"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { useHoloTilt } from "@/lib/hooks/use-holo-tilt"
import { cn } from "@/lib/utils"

interface EventCardProps {
  event: EventDisplay
  /** Se o usuário logado já tem a medalha desse evento (`user_medals`). */
  claimed: boolean
  isLoggedIn: boolean
  /** Saldo de Aura do usuário — só relevante pra eventos `aura_redeem`. */
  auraBalance: number
  /**
   * VIP ativo agora — medalha de `aura_redeem` sai 10% mais barata, mesma
   * regra da Central de Aura. Quem cobra é `claim_event_medal` em SQL.
   */
  isVip: boolean
  /** Resgate manual em andamento para este card específico. */
  pending: boolean
  onClaim: () => void
}

/** Rodapé de ação: o único bloco que muda de fato entre os critérios de evento. */
function EventFooter({ event, claimed, isLoggedIn, auraBalance, isVip, pending, onClaim }: EventCardProps) {
  // Preço já com desconto: o afford e todos os textos abaixo usam ele, senão
  // um VIP com saldo entre os dois preços veria "faltam X Aura" para uma
  // medalha que a RPC deixaria ele resgatar.
  const price = auraPriceForVip(event.auraCost ?? 0, isVip)

  if (claimed) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        Resgatada
      </div>
    )
  }

  if (event.criteriaType === "first_n_signups") {
    return (
      <p className="text-center text-[10px] leading-snug text-muted-foreground/80">
        {isLoggedIn ? (
          "Concedida automaticamente enquanto houver vagas."
        ) : (
          <>
            Concedida no cadastro.{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Crie sua conta →
            </Link>
          </>
        )}
      </p>
    )
  }

  // manual_opt_in / aura_redeem
  const soldOut = !event.active || (event.maxParticipants !== null && event.currentCount >= event.maxParticipants)
  if (soldOut) {
    return (
      <Button size="sm" variant="outline" disabled className="w-full gap-1.5 text-xs">
        <Lock className="size-3.5" />
        Sem vagas
      </Button>
    )
  }

  if (event.criteriaType === "aura_redeem" && isLoggedIn && auraBalance < price.finalPrice) {
    const missing = price.finalPrice - auraBalance
    return (
      <div className="flex w-full flex-col items-center gap-1.5">
        <Button size="sm" variant="outline" disabled className="w-full gap-1.5 text-xs">
          <Lock className="size-3.5" />
          Faltam {missing} Aura para resgatar
        </Button>
        <p className="text-[10px] leading-snug text-muted-foreground/80">
          Vamos pedir sua confirmação antes de gastar a Aura
        </p>
      </div>
    )
  }

  const label =
    event.criteriaType === "aura_redeem" && isLoggedIn
      ? `Gastar ${price.finalPrice} Aura para resgatar`
      : "Resgatar"

  // aura_redeem cobra Aura pra resgatar — pede confirmação explícita antes de
  // debitar, pra ninguém ser cobrado sem saber (o custo já aparece no label
  // do botão e na tag do card, mas isso sozinho não é aviso suficiente).
  if (event.criteriaType === "aura_redeem" && isLoggedIn) {
    return (
      <AlertDialog>
        <div className="flex w-full flex-col items-center gap-1.5">
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
              }}
              disabled={pending}
              className="w-full gap-1.5 text-xs"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {pending ? "Resgatando..." : label}
            </Button>
          </AlertDialogTrigger>
          {!pending && (
            <p className="text-[10px] leading-snug text-muted-foreground/80">
              Vamos pedir sua confirmação antes de gastar a Aura
            </p>
          )}
        </div>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Gastar {price.finalPrice} Aura para resgatar?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai <strong className="text-foreground">perder {price.finalPrice} de Aura</strong> do
              seu saldo para pegar a medalha &quot;{event.name}&quot;. Seu saldo atual é {auraBalance}{" "}
              Aura. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {price.discounted && (
            <p
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold"
              style={{ backgroundColor: "oklch(0.75 0.19 320 / 0.12)", color: "var(--vip-accent)" }}
            >
              <Crown className="size-3.5" strokeWidth={2} />
              Seu VIP tirou {price.savings} Aura do preço original de {price.listPrice}.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation()
                onClaim()
              }}
              disabled={pending}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <Button
      size="sm"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClaim()
      }}
      disabled={pending}
      className="w-full gap-1.5 text-xs"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? "Resgatando..." : isLoggedIn ? label : "Entrar para resgatar"}
    </Button>
  )
}

/**
 * Card de medalha no formato de carta colecionável.
 *
 * O layout segue a anatomia de uma carta de TCG porque os dados do evento já
 * caem nela quase sem forçar: nome e custo no cabeçalho (onde vai o HP),
 * arte na janela, critério na faixa de tipo, descrição na caixa de texto, e
 * no rodapé o símbolo de raridade com o número de coleção — que aqui é
 * literalmente `currentCount / maxParticipants`, já no formato "256/500".
 *
 * O botão de resgate fica FORA da moldura: a carta é o colecionável, o botão
 * é interface. Enfiar um controle clicável dentro da arte é o que faz um
 * layout desses parecer um banner com borda.
 */
export function EventCard(props: EventCardProps) {
  const { event, claimed, isVip } = props
  const holoProps = useHoloTilt<HTMLDivElement>()
  const auraPrice = auraPriceForVip(event.auraCost ?? 0, isVip)
  const percent =
    event.maxParticipants !== null
      ? Math.min(100, Math.round((event.currentCount / event.maxParticipants) * 100))
      : null

  // Evento encerrado já sai dessaturado: acender o foil por cima brigaria com
  // o "isto acabou" que a própria cor do card está dizendo.
  const holoStrength = event.active ? MEDAL_RARITY_HOLO[event.rarity] : 0
  const accent = MEDAL_RARITY_SOLID[event.rarity]
  const showCost = event.criteriaType === "aura_redeem" && !claimed && Boolean(event.auraCost)

  return (
    <div className="flex w-64 flex-col gap-3">
      <div
        className={cn("relative", event.active && "event-card-glow")}
        style={{ "--glow-color": MEDAL_RARITY_GLOW[event.rarity] } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              {...(holoStrength > 0 ? holoProps : null)}
              className={cn(
                "relative flex aspect-[63/88] w-full cursor-help flex-col overflow-hidden rounded-xl p-[5px]",
                // O `.medal-holo` já sobe o card no hover pelo próprio
                // transform; deixar as duas regras juntas seria uma
                // sobrescrevendo a outra.
                holoStrength > 0 ? "medal-holo" : "transition-transform hover:-translate-y-1",
                !event.active && "grayscale-[0.4] opacity-70"
              )}
              style={
                {
                  "--holo-strength": holoStrength,
                  // A moldura grossa na cor da raridade é a borda amarela da
                  // carta: é ela que dá a leitura de "carta" antes de
                  // qualquer conteúdo carregar.
                  backgroundImage: `linear-gradient(155deg, ${accent}, color-mix(in oklch, ${accent} 45%, #000))`,
                } as React.CSSProperties
              }
            >
              <div className="relative flex flex-1 flex-col gap-1.5 overflow-hidden rounded-lg bg-card px-2.5 py-2">
                <header className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-bold leading-tight text-foreground">
                    {event.name}
                  </p>
                  {showCost && (
                    <span className="flex shrink-0 items-baseline gap-1">
                      {auraPrice.discounted && (
                        <span className="text-[9px] text-muted-foreground/70 line-through">
                          {auraPrice.listPrice}
                        </span>
                      )}
                      <span className="text-[15px] font-black leading-none" style={{ color: accent }}>
                        {auraPrice.finalPrice}
                      </span>
                      <Flame
                        className="size-3 shrink-0 text-orange-400"
                        fill="currentColor"
                        strokeWidth={1.5}
                      />
                    </span>
                  )}
                </header>

                {/* Proporção fixa, e não `flex-1`: com a arte absorvendo a
                    sobra, uma medalha de descrição longa ganhava uma janela
                    menor que a do card ao lado, e duas cartas da mesma coleção
                    deixavam de ter a mesma anatomia. Quem absorve a sobra é a
                    caixa de texto abaixo. */}
                <div
                  className={cn(
                    "relative flex aspect-[6/5] shrink-0 items-center justify-center overflow-hidden rounded border",
                    MEDAL_RARITY_STYLES[event.rarity]
                  )}
                >
                  {event.imageUrl ? (
                    <Image
                      src={event.imageUrl}
                      alt={event.name}
                      width={128}
                      height={128}
                      className="size-[72%] object-contain"
                    />
                  ) : (
                    <Award className="size-12" />
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span
                    className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`, color: accent }}
                  >
                    {EVENT_CRITERIA_SHORT_LABEL[event.criteriaType]}
                  </span>
                  {auraPrice.discounted && !claimed && (
                    <span className="aura-vip-discount-badge flex items-center gap-0.5 rounded-full px-1.5 py-[3px] text-[9px] font-black uppercase leading-none tracking-wide">
                      <Crown className="size-2.5" strokeWidth={2.5} />−{auraPrice.discountPercent}%
                    </span>
                  )}
                </div>

                {/* Centralizado na sobra: uma carta real preenche esta faixa
                    com a caixa de ataque, e aqui costuma haver só uma frase.
                    Alinhada ao topo ela deixa um vazio no pé do card; no meio,
                    a mesma folga vira respiro dos dois lados. */}
                <div className="flex flex-1 items-center">
                  <p className="line-clamp-4 text-[10px] leading-snug text-muted-foreground">
                    {event.description}
                  </p>
                </div>

                <div className="space-y-1">
                  {percent !== null && (
                    <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className={cn("h-full rounded-full transition-all", MEDAL_RARITY_BAR[event.rarity])}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[9px] font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span style={{ color: accent }}>{MEDAL_RARITY_SYMBOL[event.rarity]}</span>
                      {MEDAL_RARITY_LABEL[event.rarity]}
                    </span>
                    <span className="tabular-nums">
                      {event.maxParticipants !== null
                        ? `${event.currentCount}/${event.maxParticipants}`
                        : `${event.currentCount} resgates`}
                    </span>
                  </div>
                </div>
              </div>

              {!event.active && (
                <span className="absolute right-2.5 top-2.5 z-[3] rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Encerrado
                </span>
              )}
              {claimed && event.active && (
                <span className="absolute right-2.5 top-2.5 z-[3] flex size-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                </span>
              )}

              {/* Por último e por cima de tudo: o foil é reflexo na superfície
                  do card, não mais uma coisa dentro da cena — mesma decisão do
                  `sheen` em MiniProfileBackground. */}
              {holoStrength > 0 && (
                <>
                  <span className="medal-holo-layer medal-holo-foil" aria-hidden />
                  <span className="medal-holo-layer medal-holo-sheen" aria-hidden />
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-[220px] text-xs">{event.description ?? event.name}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <EventFooter {...props} />
    </div>
  )
}
