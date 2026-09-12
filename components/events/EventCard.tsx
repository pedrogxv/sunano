"use client"

import Link from "next/link"
import { CheckCircle2, Crown, Loader2, Lock } from "lucide-react"

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
import { MedalCard } from "@/components/events/MedalCard"
import { type EventDisplay } from "@/lib/events"
import { auraPriceForVip } from "@/lib/aura-pricing"

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
 * Card de medalha de /conquistas: a carta (`MedalCard`) mais o que é exclusivo
 * desta tela — o tooltip com a descrição completa e o rodapé de resgate.
 *
 * O botão fica FORA da moldura: a carta é o colecionável, o botão é interface.
 * Enfiar um controle clicável dentro da arte é o que faz um layout desses
 * parecer um banner com borda.
 */
export function EventCard(props: EventCardProps) {
  const { event, claimed, isVip } = props

  return (
    <div className="flex w-64 flex-col gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <MedalCard event={event} claimed={claimed} isVip={isVip} className="cursor-help" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[220px] text-xs">{event.description ?? event.name}</p>
        </TooltipContent>
      </Tooltip>

      <EventFooter {...props} />
    </div>
  )
}
