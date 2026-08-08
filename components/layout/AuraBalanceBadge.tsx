"use client"

import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { Flame, Snowflake } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuthUser } from "@/components/providers/auth-context"
import { AURA_CHANGED_EVENT } from "@/lib/client/aura-events"

type AuraUsage = {
  balance: number
  givenToday: number
  limit: number
  limitReached: boolean
  nextSlotAt: string | null
}

/** Só pra formatar "Xh Ymin" numa contagem regressiva — sem trazer date-fns pra isso. */
function formatCountdown(targetIso: string, now: number): string {
  const diffMs = new Date(targetIso).getTime() - now
  if (diffMs <= 0) return "a qualquer momento"
  const totalMinutes = Math.ceil(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

/**
 * Intervalo do polling de fallback — não é a via principal de atualização:
 * toda reação de aura dada pelo próprio usuário já dispara `AURA_CHANGED_EVENT`
 * (ver `notifyAuraChanged`), que refaz o fetch na hora. O polling só cobre o
 * caso de aura recebida de outra pessoa (comentário curtido por alguém em
 * outra aba/sessão) e o "descongelar" do limite diário.
 */
const POLL_MS = 20_000

/** Fetch + polling do uso de Aura, compartilhado entre o badge compacto (topbar) e a linha do menu mobile. */
function useAuraUsage() {
  const { user } = useAuthUser()
  const [usage, setUsage] = useState<AuraUsage | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    let next: AuraUsage | null = null
    try {
      const res = await fetch("/api/aura/summary")
      next = res.ok ? await res.json() : null
    } catch {
      next = null
    } finally {
      setUsage(next)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    window.addEventListener(AURA_CHANGED_EVENT, load)
    return () => {
      clearInterval(id)
      window.removeEventListener(AURA_CHANGED_EVENT, load)
    }
  }, [user, load])

  // Só o suficiente pra o texto do tooltip contar os minutos pra baixo enquanto aberto.
  useEffect(() => {
    if (!usage?.limitReached) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [usage?.limitReached])

  return { user, usage, now }
}

/**
 * Badge de reações de Aura disponíveis na TopBar (ao lado da conta) — mostra
 * quantas do limite diário (50/24h, `toggle_forum_aura`) ainda restam, não o
 * saldo acumulado (esse já aparece no perfil, `EstatisticasGrid`). Quando o
 * limite estoura, o badge "congela" (efeito visual de gelo) até o rolling
 * window liberar de novo.
 */
export function AuraBalanceBadge() {
  const { user, usage, now } = useAuraUsage()

  if (!user || !usage) return null

  const frozen = usage.limitReached
  const remaining = Math.max(usage.limit - usage.givenToday, 0)
  const pct = usage.limit > 0 ? Math.round((remaining / usage.limit) * 100) : 0
  // Chama nunca some de vez enquanto sobra pelo menos 1 reação — só fica
  // bem tênue perto do fim, pra "quase congelado" ainda se diferenciar de
  // "congelado" (opacity 1 de verdade só no ícone de gelo).
  const iconOpacity = frozen ? 1 : Math.max(pct / 100, 0.25)

  const tooltipText = frozen
    ? usage.nextSlotAt
      ? `Aura congelada! Você usou as ${usage.limit} reações de hoje — recarrega em ${formatCountdown(usage.nextSlotAt, now)}`
      : `Aura congelada! Você usou as ${usage.limit} reações de hoje — volte mais tarde`
    : `${remaining} de ${usage.limit} reações disponíveis hoje — seu saldo de aura é ${usage.balance}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`aura-balance-badge hidden shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold tabular-nums transition-all sm:flex sm:h-8 sm:w-auto sm:justify-start sm:px-3 ${
            frozen
              ? "border-sky-400/40 bg-sky-500/10 text-sky-300"
              : "border-border bg-card/70 text-foreground"
          }`}
          data-frozen={frozen}
        >
          <span
            className="aura-gauge size-[19px] shrink-0"
            style={{ "--aura-gauge-pct": frozen ? 0 : pct } as CSSProperties}
          >
            {frozen ? (
              <Snowflake className="aura-balance-icon size-[13px] text-sky-300" />
            ) : (
              <Flame
                className="aura-gauge-icon size-[13px] text-orange-500"
                style={{ opacity: iconOpacity }}
                fill="currentColor"
                strokeWidth={1.5}
              />
            )}
          </span>
          <span className="hidden leading-none sm:inline">
            {remaining}
            <span className="text-muted-foreground font-normal">/{usage.limit}</span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-56 text-center">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Linha de resumo de Aura para dentro do menu do avatar no mobile — mesmo
 * dado de `AuraBalanceBadge`, só que como texto (sem gauge/tooltip), já que
 * ali ela não compete por espaço na barra. Ver `mobileExtraItems` em
 * `AuthUser`.
 */
export function AuraBalanceRow() {
  const { user, usage } = useAuraUsage()

  if (!user || !usage) return null

  const frozen = usage.limitReached
  const remaining = Math.max(usage.limit - usage.givenToday, 0)

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-muted-foreground">
      {frozen ? (
        <Snowflake className="size-4 shrink-0 text-sky-300" />
      ) : (
        <Flame className="size-4 shrink-0 text-orange-500" fill="currentColor" strokeWidth={1.5} />
      )}
      <span className="text-foreground">Aura</span>
      <span className="ml-auto tabular-nums">
        {frozen ? (
          <span className="text-sky-300">Congelada</span>
        ) : (
          <>
            {remaining}
            <span className="text-muted-foreground">/{usage.limit}</span>
          </>
        )}
      </span>
    </div>
  )
}
