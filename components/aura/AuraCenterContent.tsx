"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { Bird, Check, Flame, MessageSquare, Sparkles, SquarePen, Trophy } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { formatStreakMultiplier, streakHeatTier, STREAK_HEAT_STYLES } from "@/lib/streak-multiplier"
import {
  DAILY_MISSION_REWARDS,
  countCompletedMissions,
  type DailyMissionKey,
  type DailyMissionsState,
  type UserStreak,
} from "@/lib/achievements"
import type {
  AuraItem,
  DisplayNameCooldown,
  VipStatus,
} from "@/lib/server/repositories/aura-store-repository"
import { AuraNextSlotCountdown } from "@/components/aura/AuraNextSlotCountdown"
import { AuraItemCard } from "@/components/aura/AuraItemCard"
import { VipMonthCard } from "@/components/aura/VipMonthCard"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { DisplayNameChangeCard } from "@/components/aura/DisplayNameChangeCard"
import { YoutubeSubscriptionCard } from "@/components/aura/YoutubeSubscriptionCard"

type AuraUsage = {
  balance: number
  givenToday: number
  limit: number
  limitReached: boolean
  nextSlotAt: string | null
}

interface AuraCenterContentProps {
  isLoggedIn: boolean
  balance: number
  totalEarned: number
  rank: number | null
  streak: UserStreak
  usage: AuraUsage
  items: AuraItem[]
  initialOwnedItemIds: string[]
  initialEquippedItemId: string | null
  missions: DailyMissionsState
  youtubeConfirmed: boolean
  vipStatus: VipStatus
  nameCooldown: DisplayNameCooldown
  displayName: string
}

/**
 * Tarefas diárias reais (`daily_missions`/`complete_daily_mission`) — mesma
 * fonte de verdade do badge da TopBar (`AuraMissionsBadge`), não uma lista
 * estática desalinhada do que o banco de fato credita. `gave_aura` já cobre
 * curtir posts/comentários; "manter a ofensiva" não é uma tarefa clicável —
 * ela é a consequência de completar as 3 de baixo, e ganha o próprio card
 * de Ofensiva em vez de entrar aqui.
 */
const TASKS: Array<{ key: DailyMissionKey; icon: React.ElementType; text: string; href: string }> = [
  { key: "created_post", icon: SquarePen, text: "Criar um post no fórum", href: "/forum" },
  { key: "wrote_comment", icon: MessageSquare, text: "Comentar em um post ou notícia", href: "/forum" },
  { key: "gave_aura", icon: Sparkles, text: "Dar aura em um post ou comentário", href: "/forum" },
]

type EmberStyle = CSSProperties & {
  "--ember-size"?: string
  "--ember-color"?: string
  "--ember-duration"?: string
  "--ember-delay"?: string
  "--ember-drift"?: string
}

const EMBERS: Array<{ left: string; style: EmberStyle }> = [
  { left: "8%", style: { "--ember-size": "3px", "--ember-color": "#ff8f00", "--ember-duration": "2.8s", "--ember-delay": "0s", "--ember-drift": "10px" } },
  { left: "22%", style: { "--ember-size": "2px", "--ember-color": "#ffb703", "--ember-duration": "3.4s", "--ember-delay": "0.6s", "--ember-drift": "-8px" } },
  { left: "38%", style: { "--ember-size": "4px", "--ember-color": "#ff5f1f", "--ember-duration": "3s", "--ember-delay": "1.1s", "--ember-drift": "6px" } },
  { left: "55%", style: { "--ember-size": "2px", "--ember-color": "#ffb703", "--ember-duration": "2.6s", "--ember-delay": "1.6s", "--ember-drift": "-12px" } },
  { left: "68%", style: { "--ember-size": "3px", "--ember-color": "#ff8f00", "--ember-duration": "3.6s", "--ember-delay": "0.3s", "--ember-drift": "8px" } },
  { left: "82%", style: { "--ember-size": "2px", "--ember-color": "#ff3d00", "--ember-duration": "3.1s", "--ember-delay": "2s", "--ember-drift": "-6px" } },
  { left: "92%", style: { "--ember-size": "3px", "--ember-color": "#ffb703", "--ember-duration": "2.9s", "--ember-delay": "1.4s", "--ember-drift": "4px" } },
]

export function AuraCenterContent({
  isLoggedIn,
  balance,
  totalEarned,
  rank,
  streak,
  usage,
  items,
  initialOwnedItemIds,
  initialEquippedItemId,
  missions,
  youtubeConfirmed,
  vipStatus,
  nameCooldown,
  displayName,
}: AuraCenterContentProps) {
  // `initial*` só muda entre navegações de página inteira (novo render do
  // Server Component), nunca em re-render do client — então o valor inicial
  // do useState basta, sem useEffect de sincronização. Saldo/posse mudando
  // em outra aba/tela (ex.: deu aura no fórum) não reflete aqui até um F5 —
  // não crítico o suficiente pra justificar escutar AURA_CHANGED_EVENT: o
  // usuário já vê o próprio saldo atualizar ao resgatar algo nesta tela.
  const [ownedItemIds, setOwnedItemIds] = useState(() => new Set(initialOwnedItemIds))
  const [equippedItemId, setEquippedItemId] = useState(initialEquippedItemId)
  const [currentBalance, setCurrentBalance] = useState(balance)
  const [vip, setVip] = useState(vipStatus)
  const [nameCooldownState, setNameCooldownState] = useState(nameCooldown)
  const [currentName, setCurrentName] = useState(displayName)
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const youtubeStatus = searchParams.get("youtube")
  const { openLogin } = useAuthModal()

  // Feedback do redirect de app/auth/youtube/callback/route.ts — mostra o
  // toast uma vez e limpa o query param pra não repetir num refresh manual.
  useEffect(() => {
    if (!youtubeStatus) return
    if (youtubeStatus === "confirmed") {
      toast.success("Inscrição confirmada! +50 de Aura e a conquista Inscrito.")
      setCurrentBalance((prev) => prev + 50)
    } else if (youtubeStatus === "not_subscribed") {
      toast.error("Não encontramos sua inscrição no canal. Inscreva-se e tente de novo.")
    } else {
      toast.error("Não foi possível confirmar sua inscrição. Tente novamente.")
    }
    router.replace("/aura", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeStatus])

  const heatTier = streakHeatTier(streak.current)
  const heatStyle = STREAK_HEAT_STYLES[heatTier]

  // Requer login apenas na hora de agir (resgatar, equipar, completar
  // missão etc.) — a central em si (saldo, loja, tarefas) fica visível sem
  // conta, só com os valores zerados vindos do server para deslogado.
  function requireLogin(): boolean {
    if (isLoggedIn) return true
    openLogin("/aura")
    return false
  }

  return (
    <>
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:py-12">
      {/* Título "banner de fogueira": texto em brasa correndo + fagulhas subindo */}
      <div className="aura-title-banner relative flex items-center gap-4 overflow-visible pb-2">
        <span className="aura-hero-icon-holder relative flex size-14 shrink-0 items-center justify-center sm:size-16">
          <Flame className="aura-hero-icon-flame size-8 text-orange-500 sm:size-9" fill="currentColor" strokeWidth={1.2} />
        </span>
        <div className="space-y-1">
          <h1 className="aura-title-text font-display text-3xl font-black leading-tight sm:text-4xl">
            Central de Aura
          </h1>
          <p className="text-sm text-muted-foreground">
            Ganhe Aura participando da comunidade e troque por itens exclusivos de perfil.
          </p>
        </div>
        {EMBERS.map((ember, i) => (
          <span key={i} className="aura-ember" style={{ left: ember.left, ...ember.style }} aria-hidden />
        ))}
      </div>

      {/* Cards de status */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={cn("flex flex-col gap-2 rounded-2xl border p-5", CARD_SURFACE)}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flame className="size-4 text-orange-500" fill="currentColor" strokeWidth={1.5} />
            <span className="text-xs font-semibold uppercase tracking-wider">Saldo atual</span>
          </div>
          <p className="font-display text-3xl font-bold text-foreground tabular-nums">{currentBalance.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">
            {totalEarned.toLocaleString("pt-BR")} ganhos ao todo
            {rank && <> · <span className="font-semibold text-foreground">#{rank}</span> no ranking</>}
          </p>
        </div>

        {/* Ofensiva + multiplicador — os dois números vêm da mesma fonte
            (dias consecutivos de missões completas), então moram juntos em
            vez de espalhados em dois cards separados. */}
        <div id="multiplicador" className={cn("flex flex-col gap-2 rounded-2xl border p-5 scroll-mt-20", CARD_SURFACE)}>
          <div className={cn("flex items-center gap-2", heatStyle.text)}>
            <Bird className={cn("size-4", heatStyle.glow)} strokeWidth={1.5} />
            <span className="text-xs font-semibold uppercase tracking-wider">Ofensiva</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-3xl font-bold text-foreground tabular-nums">
              {streak.current} dia{streak.current === 1 ? "" : "s"}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                streak.current > 0 ? cn("bg-current/10", heatStyle.text) : "bg-muted text-muted-foreground"
              )}
              title="Multiplicador de Aura pela ofensiva atual"
            >
              +{formatStreakMultiplier(streak.current)} mult.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {streak.current > 0
              ? <>Recorde: {streak.longest} dia{streak.longest === 1 ? "" : "s"} — bônus em todo ganho de Aura</>
              : "Complete as 3 tarefas abaixo hoje para começar"}
          </p>
        </div>

        <div className={cn("flex flex-col gap-2 rounded-2xl border p-5", CARD_SURFACE)}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flame className="size-4" strokeWidth={1.5} />
            <span className="text-xs font-semibold uppercase tracking-wider">Próxima aura liberada</span>
          </div>
          {usage.limitReached && usage.nextSlotAt ? (
            <AuraNextSlotCountdown nextSlotAt={usage.nextSlotAt} />
          ) : (
            <p className="font-display text-2xl font-bold text-emerald-400">Disponível</p>
          )}
          <p className="text-xs text-muted-foreground">
            {usage.givenToday}/{usage.limit} reações dadas nas últimas 24h
          </p>
        </div>
      </div>

      {/* Tarefas diárias reais — mesmo estado de daily_missions, feito/pendente hoje */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">Tarefas de hoje</h2>
          <span className="text-xs font-semibold text-muted-foreground">
            {countCompletedMissions(missions)}/{TASKS.length} concluídas
          </span>
        </div>
        <div className={cn("divide-y divide-border overflow-hidden rounded-2xl border", CARD_SURFACE)}>
          {TASKS.map(({ key, icon: Icon, text, href }) => {
            const done = missions[key]
            const reward = DAILY_MISSION_REWARDS[key]
            return (
              <Link
                key={key}
                href={href}
                onClick={(event) => {
                  if (!isLoggedIn) {
                    event.preventDefault()
                    requireLogin()
                  }
                }}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 transition-colors",
                  done ? "bg-emerald-400/[0.04]" : "hover:bg-orange-500/5"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                    done
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-border text-muted-foreground group-hover:border-orange-500/40 group-hover:text-orange-400"
                  )}
                >
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className={cn("flex-1 text-sm", done ? "text-muted-foreground line-through decoration-emerald-400/50" : "text-foreground")}>
                  {text}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold",
                    done ? "bg-emerald-400/10 text-emerald-300" : "bg-orange-500/10 text-orange-400"
                  )}
                >
                  {done ? "Feito hoje" : `+${reward}`}
                </span>
              </Link>
            )
          })}
          {/* Bônus por completar as 3 — linha de resumo, não clicável (não é uma ação própria). */}
          <div className={cn("flex items-center gap-3 px-4 py-3", missions.bonus_claimed && "bg-emerald-400/[0.04]")}>
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                missions.bonus_claimed
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-border text-muted-foreground"
              )}
            >
              {missions.bonus_claimed ? <Check className="size-4" /> : <Trophy className="size-4" />}
            </span>
            <span className={cn("flex-1 text-sm", missions.bonus_claimed ? "text-muted-foreground" : "text-foreground")}>
              Bônus por completar as 3 tarefas + avançar a ofensiva
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold",
                missions.bonus_claimed ? "bg-emerald-400/10 text-emerald-300" : "bg-orange-500/10 text-orange-400"
              )}
            >
              {missions.bonus_claimed ? "Resgatado" : "+10"}
            </span>
          </div>
        </div>
      </div>

      {/* Conquista especial "Inscrito" — binária, fora da grade de missões/loja */}
      <YoutubeSubscriptionCard confirmed={youtubeConfirmed} requireLogin={requireLogin} />

      {/* Loja de itens */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold text-foreground">Loja de itens</h2>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum item disponível no momento. Volte em breve!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              if (item.kind === "vip_month") {
                return (
                  <VipMonthCard
                    key={item.id}
                    item={item}
                    balance={currentBalance}
                    vipActive={vip.active}
                    vipExpiresAt={vip.expiresAt}
                    requireLogin={requireLogin}
                    onPurchased={(expiresAt) => {
                      setVip({ active: true, expiresAt })
                      setCurrentBalance((prev) => prev - item.auraCost)
                    }}
                    onShowBenefits={() => setVipUpsellOpen(true)}
                  />
                )
              }

              if (item.kind === "display_name_change") {
                return (
                  <DisplayNameChangeCard
                    key={item.id}
                    item={item}
                    balance={currentBalance}
                    cooldown={nameCooldownState}
                    currentName={currentName}
                    requireLogin={requireLogin}
                    onChanged={(newName) => {
                      const now = new Date()
                      const endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
                      setCurrentName(newName)
                      setNameCooldownState({ onCooldown: true, changedAt: now.toISOString(), endsAt: endsAt.toISOString() })
                      setCurrentBalance((prev) => prev - item.auraCost)
                    }}
                  />
                )
              }

              return (
                <AuraItemCard
                  key={item.id}
                  item={item}
                  balance={currentBalance}
                  owned={ownedItemIds.has(item.id)}
                  equipped={equippedItemId === item.id}
                  requireLogin={requireLogin}
                  onRedeemed={() => {
                    setOwnedItemIds((prev) => new Set(prev).add(item.id))
                    setCurrentBalance((prev) => prev - item.auraCost)
                  }}
                  onEquipChange={(next) => setEquippedItemId(next)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
    <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </>
  )
}
