"use client"

import Image from "next/image"
import { Award, CheckCircle2, Crown, Flame } from "lucide-react"

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

interface MedalCardProps extends React.ComponentPropsWithoutRef<"div"> {
  event: EventDisplay
  /** Se o usuário logado já tem a medalha desse evento (`user_medals`). */
  claimed: boolean
  /** VIP ativo agora — risca o preço cheio e mostra o desconto na tag. */
  isVip?: boolean
  /**
   * Halo pulsante em volta da carta. A Home usa a variante `strong` porque
   * seus cards ficam soltos numa fileira só; em /conquistas, com a grade
   * cheia, o halo forte de cada carta invadiria a vizinha.
   */
  glow?: "default" | "strong"
}

/**
 * A FACE da carta de medalha — moldura, arte, dados e o foil holográfico.
 *
 * Vive separada do `EventCard` porque a mesma carta aparece em dois lugares
 * com envoltórios diferentes: em /conquistas dentro de um tooltip, com o
 * botão de resgate embaixo; na Home dentro de um `<Link>` para /conquistas.
 * Só o envoltório muda — a carta é a mesma, e duplicar essa anatomia foi
 * exatamente o que deixou a Home para trás quando o layout virou carta.
 *
 * Quem usa é responsável pela LARGURA (as duas telas usam tamanhos
 * diferentes); a proporção 63/88 e o resto da anatomia saem daqui.
 *
 * O resto das props (`ref` incluso, que no React 19 é prop normal) cai no
 * elemento externo: é assim que o `asChild` do `TooltipTrigger` em
 * /conquistas consegue prender o tooltip na carta.
 */
export function MedalCard({
  event,
  claimed,
  isVip = false,
  glow = "default",
  className,
  ...rest
}: MedalCardProps) {
  const holoProps = useHoloTilt<HTMLDivElement>()
  const auraPrice = auraPriceForVip(event.auraCost ?? 0, isVip)
  const percent =
    event.maxParticipants !== null
      ? Math.min(100, Math.round((event.currentCount / event.maxParticipants) * 100))
      : null

  // Evento encerrado já sai dessaturado: acender o foil por cima brigaria com
  // o "isto acabou" que a própria cor do card está dizendo.
  const holoStrength = event.active ? MEDAL_RARITY_HOLO[event.rarity] : 0
  // A inclinação (a carta seguindo o ponteiro) é uma mecânica separada do
  // foil: ela não é sinal de raridade, é só "isto é uma carta". Antes estava
  // amarrada a `holoStrength > 0`, e como toda medalha nasce `common` no
  // banco (holo 0), a maioria dos cards ficava totalmente parada.
  const tiltEnabled = event.active
  const accent = MEDAL_RARITY_SOLID[event.rarity]
  const showCost = event.criteriaType === "aura_redeem" && !claimed && Boolean(event.auraCost)

  return (
    <div
      {...rest}
      className={cn(
        "relative",
        event.active && "event-card-glow",
        event.active && glow === "strong" && "event-card-glow-strong",
        className
      )}
      style={
        { "--glow-color": MEDAL_RARITY_GLOW[event.rarity], ...rest.style } as React.CSSProperties
      }
    >
      <div
        {...(tiltEnabled ? holoProps : null)}
        className={cn(
          "relative flex aspect-[63/88] w-full flex-col overflow-hidden rounded-xl p-[5px]",
          // O `.medal-holo` já sobe o card no hover pelo próprio transform;
          // deixar as duas regras juntas seria uma sobrescrevendo a outra.
          tiltEnabled ? "medal-holo" : "transition-transform hover:-translate-y-1",
          !event.active && "grayscale-[0.4] opacity-70"
        )}
        style={
          {
            "--holo-strength": holoStrength,
            // A moldura grossa na cor da raridade é a borda amarela da carta:
            // é ela que dá a leitura de "carta" antes de qualquer conteúdo
            // carregar.
            backgroundImage: `linear-gradient(155deg, ${accent}, color-mix(in oklch, ${accent} 45%, #000))`,
          } as React.CSSProperties
        }
      >
        <div className="relative flex flex-1 flex-col gap-1.5 overflow-hidden rounded-lg bg-card px-2.5 py-2">
          <header className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[13px] font-bold leading-tight text-foreground">{event.name}</p>
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
                <Flame className="size-3 shrink-0 text-orange-400" fill="currentColor" strokeWidth={1.5} />
              </span>
            )}
          </header>

          {/* Proporção fixa, e não `flex-1`: com a arte absorvendo a sobra,
              uma medalha de descrição longa ganhava uma janela menor que a do
              card ao lado, e duas cartas da mesma coleção deixavam de ter a
              mesma anatomia. Quem absorve a sobra é a caixa de texto abaixo. */}
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
                className="size-[85%] object-contain"
              />
            ) : (
              <Award className="size-12" />
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <span
                className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`, color: accent }}
              >
                {EVENT_CRITERIA_SHORT_LABEL[event.criteriaType]}
              </span>
              {event.requiresVip && (
                <span
                  className="aura-vip-discount-badge flex items-center gap-0.5 rounded-full px-1.5 py-[3px] text-[9px] font-black uppercase leading-none tracking-wide"
                  title="Exclusiva para VIP"
                >
                  <Crown className="size-2.5" strokeWidth={2.5} />
                </span>
              )}
            </span>
            {auraPrice.discounted && !claimed && (
              <span className="aura-vip-discount-badge flex items-center gap-0.5 rounded-full px-1.5 py-[3px] text-[9px] font-black uppercase leading-none tracking-wide">
                <Crown className="size-2.5" strokeWidth={2.5} />−{auraPrice.discountPercent}%
              </span>
            )}
          </div>

          {/* Centralizado na sobra: uma carta real preenche esta faixa com a
              caixa de ataque, e aqui costuma haver só uma frase. Alinhada ao
              topo ela deixa um vazio no pé do card; no meio, a mesma folga
              vira respiro dos dois lados. */}
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

        {/* Por último e por cima de tudo: o foil é reflexo na superfície do
            card, não mais uma coisa dentro da cena — mesma decisão do `sheen`
            em MiniProfileBackground. */}
        {holoStrength > 0 && (
          <>
            <span className="medal-holo-layer medal-holo-foil" aria-hidden />
            <span className="medal-holo-layer medal-holo-sheen" aria-hidden />
          </>
        )}
      </div>
    </div>
  )
}
