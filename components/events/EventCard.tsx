import Image from "next/image"
import Link from "next/link"
import { Award, CheckCircle2, Loader2, Lock } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { MEDAL_RARITY_BAR, MEDAL_RARITY_GLOW, MEDAL_RARITY_STYLES } from "@/lib/profile-showcase"
import type { EventDisplay } from "@/lib/events"
import { cn } from "@/lib/utils"

interface EventCardProps {
  event: EventDisplay
  /** Se o usuário logado já tem a medalha desse evento (`user_medals`). */
  claimed: boolean
  isLoggedIn: boolean
  /** Resgate manual em andamento para este card específico. */
  pending: boolean
  onClaim: () => void
}

/** Rodapé de ação: o único bloco que muda de fato entre os dois critérios de evento. */
function EventFooter({ event, claimed, isLoggedIn, pending, onClaim }: EventCardProps) {
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

  // manual_opt_in
  const soldOut = !event.active || event.currentCount >= event.maxParticipants
  if (soldOut) {
    return (
      <Button size="sm" variant="outline" disabled className="w-full gap-1.5 text-xs">
        <Lock className="size-3.5" />
        Sem vagas
      </Button>
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
      {pending ? "Resgatando..." : isLoggedIn ? "Resgatar" : "Entrar para resgatar"}
    </Button>
  )
}

export function EventCard(props: EventCardProps) {
  const { event, claimed } = props
  const percent = Math.min(100, Math.round((event.currentCount / event.maxParticipants) * 100))

  return (
    <div
      className={cn("relative w-64", event.active && "event-card-glow")}
      style={{ "--glow-color": MEDAL_RARITY_GLOW[event.rarity] } as React.CSSProperties}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex cursor-help flex-col items-center gap-3 rounded-2xl border-2 bg-card p-5 text-center transition-transform hover:-translate-y-1",
              MEDAL_RARITY_STYLES[event.rarity],
              !event.active && "grayscale-[0.4] opacity-70"
            )}
          >
            {!event.active && (
              <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Encerrado
              </span>
            )}
            {claimed && event.active && (
              <span className="absolute left-3 top-3 flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 className="size-4" />
              </span>
            )}

            <div className="flex size-20 items-center justify-center">
              {event.imageUrl ? (
                <Image
                  src={event.imageUrl}
                  alt={event.name}
                  width={64}
                  height={64}
                  className="size-16 object-contain"
                />
              ) : (
                <Award className="size-14" />
              )}
            </div>

            <p className="font-semibold text-foreground">{event.name}</p>

            <div className="w-full space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn("h-full rounded-full transition-all", MEDAL_RARITY_BAR[event.rarity])}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {event.currentCount} / {event.maxParticipants}
              </p>
            </div>

            <EventFooter {...props} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[220px] text-xs">{event.description ?? event.name}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
