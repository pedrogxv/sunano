"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { Bird, Check, ChevronRight, HelpCircle, MessageSquare, Snowflake, Sparkles, SquarePen, Trophy } from "lucide-react"
import { AuraIcon } from "@/components/ui/AuraIcon"
import { AuraFlame, AuraFlameDefs } from "@/components/ui/AuraFlame"

import { AuraRankingModal } from "@/components/aura/AuraRankingModal"
import { AuraVipDiscountBanner } from "@/components/aura/AuraVipDiscountBanner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useAuthUser } from "@/components/providers/auth-context"
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
  StreakShieldStatus,
  StreakShieldVariant,
  VipStatus,
} from "@/lib/server/repositories/aura-store-repository"
import { StreakShieldCard } from "@/components/aura/StreakShieldCard"

/** slug do catálogo → variante do card (evita importar o const do módulo server-only). */
const SHIELD_SLUG_TO_VARIANT: Record<string, StreakShieldVariant> = {
  "protecao-ofensiva-1d": "1d",
  "protecao-ofensiva-3d": "3d",
}
import { AuraNextSlotCountdown } from "@/components/aura/AuraNextSlotCountdown"
import { AuraItemCard } from "@/components/aura/AuraItemCard"
import { VipMonthCard } from "@/components/aura/VipMonthCard"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { DisplayNameChangeCard } from "@/components/aura/DisplayNameChangeCard"
import { CommunityAchievements } from "@/components/aura/CommunityAchievements"
import { ReferralAuraCard } from "@/components/referrals/ReferralAuraCard"
import { MiniProfileBgSection } from "@/components/aura/MiniProfileBgSection"
import { AvatarFrameSection } from "@/components/aura/AvatarFrameSection"
import { AuraPeripheralSection } from "@/components/aura/AuraPeripheralSection"
import type { PrefillShipping } from "@/components/aura/PeripheralRedeemDialog"
import { isYoutubeSubscriptionEnabled } from "@/lib/youtube-subscription"
import type { PublicTrustSummary } from "@/lib/server/repositories/trust-repository"
import { getDiscordMembershipFeedback } from "@/lib/discord-membership"

type AuraUsage = {
  balance: number
  givenToday: number
  limit: number
  limitReached: boolean
  nextSlotAt: string | null
  /**
   * Tier anti-farm dos LIMITES de reação (15/50/100 por dia, 1/3/5 por
   * pessoa). Hoje derivado do Trust Factor no banco (`get_giver_trust_tier`).
   * NÃO é mais o que trava o prêmio físico — quem faz isso é `trust`.
   */
  trustTier: "new" | "normal" | "verified"
}

/** Dono de um periférico já resgatado — chave = itemId no array de tuplas. */
export type PeripheralOwnerEntry = {
  userId: string
  displayName: string
  displaySlug: string | null
  avatarUrl: string | null
}

interface AuraCenterContentProps {
  isLoggedIn: boolean
  balance: number
  rank: number | null
  streak: UserStreak
  usage: AuraUsage
  items: AuraItem[]
  initialOwnedItemIds: string[]
  initialEquippedItemId: string | null
  /** Fundo de Mini Perfil equipado (slot próprio, independente da moldura). */
  initialEquippedMiniBgId: string | null
  missions: DailyMissionsState
  youtubeConfirmed: boolean
  /** Conquista "No Discord" ligada por env (ver lib/discord-membership.ts). */
  discordEnabled: boolean
  discordConfirmed: boolean
  discordInviteUrl: string | null
  vipStatus: VipStatus
  nameCooldown: DisplayNameCooldown
  displayName: string
  /** Slug/avatar do próprio usuário — pinta o card recém-resgatado como "esgotado por você" sem F5. */
  currentUserSlug: string | null
  currentUserAvatarUrl: string | null
  streakShield: StreakShieldStatus
  /** `[itemId, donos[]]` — cada produto pode ter mais de um dono (estoque). */
  peripheralOwners: Array<[string, PeripheralOwnerEntry[]]>
  /** Último endereço de entrega conhecido do usuário — pré-preenche o resgate de produto físico. */
  shippingPrefill: PrefillShipping
  /** Id do item `vip:founder` — `null` enquanto a migration não rodou. */
  founderItemId: string | null
  /** Ids das molduras de Ofensiva por slug — vazio enquanto a migration não rodou. */
  streakFrameItemIds: Record<string, string>
  /**
   * Trust Factor da conta. Substituiu o antigo "nível verificado" como trava
   * do prêmio FÍSICO: agora exige faixa "Muito Bom" e status sem restrição
   * (ver `can_redeem_physical_item`).
   */
  trust: PublicTrustSummary
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
  rank,
  streak,
  usage,
  items,
  initialOwnedItemIds,
  initialEquippedItemId,
  initialEquippedMiniBgId,
  missions,
  youtubeConfirmed,
  discordEnabled,
  discordConfirmed,
  discordInviteUrl,
  vipStatus,
  nameCooldown,
  displayName,
  currentUserSlug,
  currentUserAvatarUrl,
  streakShield,
  peripheralOwners,
  shippingPrefill,
  founderItemId,
  streakFrameItemIds,
  trust,
}: AuraCenterContentProps) {
  // `initial*` só muda entre navegações de página inteira (novo render do
  // Server Component), nunca em re-render do client — então o valor inicial
  // do useState basta, sem useEffect de sincronização. Saldo/posse mudando
  // em outra aba/tela (ex.: deu aura no fórum) não reflete aqui até um F5 —
  // não crítico o suficiente pra justificar escutar AURA_CHANGED_EVENT: o
  // usuário já vê o próprio saldo atualizar ao resgatar algo nesta tela.
  const [ownedItemIds, setOwnedItemIds] = useState(() => new Set(initialOwnedItemIds))
  const [equippedItemId, setEquippedItemId] = useState(initialEquippedItemId)
  const [equippedMiniBgId, setEquippedMiniBgId] = useState(initialEquippedMiniBgId)
  const [currentBalance, setCurrentBalance] = useState(balance)
  const [vip, setVip] = useState(vipStatus)
  const [nameCooldownState, setNameCooldownState] = useState(nameCooldown)
  const [currentName, setCurrentName] = useState(displayName)
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)
  const [rankingOpen, setRankingOpen] = useState(false)
  const [shield, setShield] = useState(streakShield)
  const [discordOk, setDiscordOk] = useState(discordConfirmed)

  // Intensidade do fogo do card de Aura. Faixas largas e poucas (4) de
  // propósito: o fogo tem que dizer "você tem bastante" de relance, não virar
  // um medidor que a pessoa precise decifrar. Os degraus acompanham os preços
  // reais do catálogo — a maior faixa começa perto do que custa um produto
  // físico, então ver a fogueira cheia coincide com poder resgatar algo.
  const balanceHeat =
    currentBalance >= 50_000 ? "4" : currentBalance >= 10_000 ? "3" : currentBalance >= 1_000 ? "2" : "1"
  const [peripheralOwnerMap, setPeripheralOwnerMap] = useState(
    () => new Map<string, PeripheralOwnerEntry[]>(peripheralOwners)
  )

  // Trocar o nome aqui muda o que a topbar mostra, e ela lê do AuthProvider.
  const { refresh: refreshAuthUser } = useAuthUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const youtubeStatus = searchParams.get("youtube")
  const discordStatus = searchParams.get("discord")
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

  // Feedback do redirect de app/auth/discord/callback/route.ts — mesmo padrão
  // do YouTube acima: mostra o toast uma vez e limpa o query param.
  useEffect(() => {
    if (!discordStatus) return
    const feedback = getDiscordMembershipFeedback(discordStatus)
    toast[feedback.tone](feedback.message)
    if (discordStatus === "confirmed") {
      setCurrentBalance((prev) => prev + 50)
      setDiscordOk(true)
    } else if (discordStatus === "already") {
      // Membro confirmado, mas a recompensa já tinha sido creditada antes:
      // não somar de novo no saldo, só refletir o estado da conquista.
      setDiscordOk(true)
    }
    router.replace("/aura", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordStatus])

  const heatTier = streakHeatTier(streak.current)
  const heatStyle = STREAK_HEAT_STYLES[heatTier]

  // As duas variantes do escudo viram UM card só (toggle 1d/3d); o resto da
  // loja renderiza normal. Enquanto há escudo guardado o card mostra o
  // estado "guardado" em vez do botão de compra.
  const shieldVariants: Partial<Record<StreakShieldVariant, AuraItem>> = {}
  for (const it of items) {
    if (it.kind !== "streak_shield") continue
    const v = SHIELD_SLUG_TO_VARIANT[it.slug]
    if (v) shieldVariants[v] = it
  }
  const hasShieldItem = Object.keys(shieldVariants).length > 0
  // Fundos de Mini Perfil saem da grade genérica: eles têm seção própria
  // (cards maiores com o efeito rodando) logo abaixo dela.
  const miniBgItems = items.filter((it) => it.kind === "mini_profile_bg")
  // Produtos (kind `peripheral`) têm seção própria no fim da página — são o
  // prêmio mais especial da Central: estoque limitado, trava de nível
  // verificado, 1 por pessoa. Ficam fora da grade genérica de cosméticos.
  const peripheralItems = items.filter((it) => it.kind === "peripheral")
  // Molduras também saem da grade genérica: a seção própria mostra, junto das
  // compráveis, as de VIP e de ranking — que não são itens do banco, mas são
  // molduras que o usuário vê por aí e precisa entender como conseguir (ver
  // `lib/profile-frames.ts`).
  // Só as COMPRÁVEIS entram na grade: as de VIP/rank existem em `aura_items`
  // (migration 20261116000000) para a posse ter onde apontar, mas nascem
  // `active = false` e `acquisition <> 'purchase'` — a vitrine delas é o
  // catálogo em código, dentro da própria seção.
  const frameItems = items.filter(
    (it) => it.kind === "avatar_frame" && it.acquisition === "purchase"
  )
  const nonShieldItems = items.filter(
    (it) =>
      it.kind !== "streak_shield" &&
      it.kind !== "mini_profile_bg" &&
      it.kind !== "peripheral" &&
      it.kind !== "avatar_frame"
  )

  // Preços que o desconto VIP de fato alcança — alimentam o "quanto você
  // economiza" da faixa. `vip_month` fica de fora: a RPC recusa VIP ativo
  // comprando VIP, então esse item nunca sai com desconto pra ninguém.
  const discountableListPrices = items
    .filter((it) => it.kind !== "vip_month")
    .map((it) => it.auraCost)

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
      {/* Gradientes das chamas, uma vez para a página toda (ver AuraFlame.tsx). */}
      <AuraFlameDefs />
      {/* Título "banner de fogueira": texto em brasa correndo + fagulhas subindo */}
      <div className="aura-title-banner relative flex flex-wrap items-center gap-4 overflow-visible pb-2">
        <span className="aura-hero-icon-holder relative flex size-14 shrink-0 items-center justify-center sm:size-16">
          <AuraFlame size="2xl" sparks />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="aura-title-text font-display text-3xl font-black leading-tight sm:text-4xl">
            Central de Aura
          </h1>
          <p className="text-sm text-muted-foreground">
            Ganhe Aura participando da comunidade e troque por itens exclusivos de perfil.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRankingOpen(true)}
          className="relative z-[1] ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3.5 py-2 text-xs font-bold text-orange-400 transition-colors hover:bg-orange-500/20"
        >
          <Trophy className="size-3.5" />
          Ranking
        </button>
        {EMBERS.map((ember, i) => (
          <span key={i} className="aura-ember" style={{ left: ember.left, ...ember.style }} aria-hidden />
        ))}
      </div>

      {/* Cards de status */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Aura atual — o card "aceso": a chama do rótulo queima de verdade
            (ver `.aura-balance-*` no globals.css) e a intensidade do fogo
            responde ao saldo, então quem tem mais Aura vê uma fogueira maior.
            É o único card com fogo; os outros dois ficam sóbrios de propósito,
            senão o destaque se dilui. */}
        <div
          className={cn(
            "aura-balance-card relative flex flex-col gap-2 overflow-hidden rounded-2xl border p-5",
            CARD_SURFACE
          )}
          data-heat={balanceHeat}
        >
          <div className="relative z-[1] flex items-center gap-2 text-muted-foreground">
            <AuraFlame size="lg" />
            <span className="text-xs font-semibold uppercase tracking-wider">Aura atual</span>
          </div>
          <p className="relative z-[1] font-display text-3xl font-bold text-foreground tabular-nums">
            {currentBalance.toLocaleString("pt-BR")}
          </p>
          {rank && (
            <p className="relative z-[1] text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">#{rank}</span> no ranking
            </p>
          )}
        </div>

        {/* Ofensiva + multiplicador — os dois números vêm da mesma fonte
            (dias consecutivos de missões completas), então moram juntos em
            vez de espalhados em dois cards separados. */}
        <div id="multiplicador" className={cn("flex flex-col gap-2 rounded-2xl border p-5 scroll-mt-20", CARD_SURFACE)}>
          <div className={cn("flex items-center gap-2", streak.frozen ? "text-sky-400" : heatStyle.text)}>
            {streak.frozen ? (
              <Snowflake className="size-4 drop-shadow-[0_0_5px_rgba(56,189,248,0.7)]" strokeWidth={1.5} />
            ) : (
              <Bird className={cn("size-4", heatStyle.glow)} strokeWidth={1.5} />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider">Ofensiva</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-3xl font-bold text-foreground tabular-nums">
              {streak.current} dia{streak.current === 1 ? "" : "s"}
            </p>
            {streak.frozen ? (
              <span
                className="flex items-center gap-1 rounded-full bg-sky-400/10 px-2 py-0.5 text-xs font-bold text-sky-300"
                title={
                  streak.frozenUntil
                    ? `Complete as missões até ${new Date(`${streak.frozenUntil}T00:00:00`).toLocaleDateString("pt-BR")} para não perder a ofensiva`
                    : "Ofensiva protegida por um escudo"
                }
              >
                <Snowflake className="size-3" />
                Congelada
              </span>
            ) : (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                  streak.current > 0 ? cn("bg-current/10", heatStyle.text) : "bg-muted text-muted-foreground"
                )}
                title="Multiplicador de Aura pela ofensiva atual"
              >
                +{formatStreakMultiplier(streak.current)} mult.
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {streak.frozen
              ? streak.frozenUntil
                ? `Escudo ativado: complete as 3 tarefas até ${new Date(`${streak.frozenUntil}T00:00:00`).toLocaleDateString("pt-BR")} para retomar a ofensiva.`
                : "Escudo ativado: complete as 3 tarefas para retomar a ofensiva."
              : streak.current > 0
                ? <>Recorde: {streak.longest} dia{streak.longest === 1 ? "" : "s"}, bônus em todo ganho de Aura</>
                : "Complete as 3 tarefas abaixo hoje para começar"}
          </p>
        </div>

        <div className={cn("flex flex-col gap-2 rounded-2xl border p-5", CARD_SURFACE)}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AuraIcon size="lg" tone="inherit" outline />
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

      {/* "Como funciona a Aura" mora na Central de Informações
          (/informacoes/central-de-aura) — texto de referência, sem duplicar.
          Aqui fica só a chamada, logo abaixo dos cards de status: quem chega
          sem entender a moeda lê a regra antes de descer pela loja. */}
      <Link
        href="/informacoes/central-de-aura"
        className={cn(
          "group flex items-center gap-4 rounded-2xl border p-5 transition-colors hover:border-orange-500/40",
          CARD_SURFACE
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400">
          <HelpCircle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold text-foreground group-hover:text-orange-400">
            Como funciona a Aura
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Todas as formas de ganhar e gastar Aura, o multiplicador de Ofensiva e VIP, e os
            limites de reações — na Central de Informações.
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-orange-400" />
      </Link>

      {/* Produtos — prêmio físico, estoque limitado, só Trust "Muito Bom".
          Fica logo abaixo do saldo: é o item mais cobiçado da Central, então
          abre a área de troca em vez de ficar no rodapé da página. */}
      <AuraPeripheralSection
        items={peripheralItems}
        owners={peripheralOwnerMap}
        balance={currentBalance}
        isLoggedIn={isLoggedIn}
        isVip={vip.active}
        trust={trust}
        currentUserSlug={currentUserSlug}
        currentUserAvatarUrl={currentUserAvatarUrl}
        currentUserName={currentName}
        shippingPrefill={shippingPrefill}
        requireLogin={requireLogin}
        onRedeemed={(itemId, cost, owner) => {
          setPeripheralOwnerMap((prev) => {
            const next = new Map(prev)
            next.set(itemId, [...(next.get(itemId) ?? []), owner])
            return next
          })
          setCurrentBalance((prev) => prev - cost)
        }}
      />

      {/* Loja de itens — vantagens genéricas (VIP, troca de nome).
          Escudo, Molduras, Fundos de Mini Perfil e Produtos têm seção própria.
          `id="vip"`: alvo do link "Assinar" vindo das configurações da conta. */}
      <div id="vip" className="scroll-mt-20 space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-foreground">Itens da loja</h2>
          <p className="text-xs text-muted-foreground">
            Cosméticos de perfil e vantagens. Sempre disponíveis, sem limite de unidades.
          </p>
        </div>
        {nonShieldItems.length === 0 && !hasShieldItem ? (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum item disponível no momento. Volte em breve!
          </p>
        ) : (
          // Fragment com space-y próprio: o `space-y-3` do wrapper só separa
          // filhos diretos, e agora banner e grade estão dentro do fragment.
          <div className="space-y-4">
          {/* Faixa do desconto VIP: confirma para o VIP que a grade abaixo já
              está com o preço dele, e mostra ao comum o que ele deixa na mesa.
              Fica acima da grade porque explica os números dela. */}
          <AuraVipDiscountBanner
            isVip={vip.active}
            listPrices={discountableListPrices}
            onShowBenefits={() => setVipUpsellOpen(true)}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {hasShieldItem && (
              <StreakShieldCard
                key="streak-shield"
                variants={shieldVariants}
                balance={currentBalance}
                isVip={vip.active}
                shieldArmed={shield.armed}
                shieldGraceDays={shield.graceDays}
                requireLogin={requireLogin}
                onPurchased={(_variant, graceDays, cost) => {
                  setShield({ armed: true, graceDays })
                  setCurrentBalance((prev) => prev - cost)
                }}
              />
            )}
            {nonShieldItems.map((item) => {
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
                      // O selo VIP da topbar e o "Seja VIP" da sidebar leem do
                      // AuthProvider, que só reconsulta quando o cookie de
                      // sessão muda — comprar VIP não mexe em cookie nenhum.
                      refreshAuthUser()
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
                    isVip={vip.active}
                    cooldown={nameCooldownState}
                    currentName={currentName}
                    requireLogin={requireLogin}
                    onChanged={(newName, _newSlug, cost) => {
                      const now = new Date()
                      const endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
                      setCurrentName(newName)
                      setNameCooldownState({ onCooldown: true, changedAt: now.toISOString(), endsAt: endsAt.toISOString() })
                      setCurrentBalance((prev) => prev - cost)
                      // O nome também aparece na topbar, que lê do AuthProvider.
                      refreshAuthUser()
                    }}
                  />
                )
              }

              return (
                <AuraItemCard
                  key={item.id}
                  item={item}
                  balance={currentBalance}
                  isVip={vip.active}
                  owned={ownedItemIds.has(item.id)}
                  equipped={equippedItemId === item.id}
                  requireLogin={requireLogin}
                  onRedeemed={(cost) => {
                    setOwnedItemIds((prev) => new Set(prev).add(item.id))
                    setCurrentBalance((prev) => prev - cost)
                  }}
                  onEquipChange={(next) => setEquippedItemId(next)}
                />
              )
            })}
          </div>
          </div>
        )}
      </div>

      {/* Molduras — seção própria: além das compráveis, mostra a de VIP e as
          de ranking, que não se compram mas aparecem no site inteiro. */}
      <AvatarFrameSection
        items={frameItems}
        balance={currentBalance}
        isVip={vip.active}
        ownedItemIds={ownedItemIds}
        equippedItemId={equippedItemId}
        currentUserAvatarUrl={currentUserAvatarUrl}
        currentUserName={currentName}
        requireLogin={requireLogin}
        onRedeemed={(itemId, cost) => {
          setOwnedItemIds((prev) => new Set(prev).add(itemId))
          setCurrentBalance((prev) => prev - cost)
        }}
        onEquipChange={setEquippedItemId}
        onShowVipBenefits={() => setVipUpsellOpen(true)}
        founderItemId={founderItemId}
        streakFrameItemIds={streakFrameItemIds}
        // O RECORDE, nunca `streak.current`: o marco alcançado é permanente,
        // e a vitrine tem de mostrar as molduras já conquistadas mesmo com a
        // ofensiva quebrada.
        longestStreak={streak.longest}
      />

      {/* Fundos de Mini Perfil — seção própria, fora da grade genérica: o
          preview de cada um é o efeito rodando, e os cards precisam de mais
          espaço do que uma célula de moldura. */}
      <MiniProfileBgSection
        items={miniBgItems}
        balance={currentBalance}
        isVip={vip.active}
        ownedItemIds={ownedItemIds}
        equippedItemId={equippedMiniBgId}
        requireLogin={requireLogin}
        onRedeemed={(itemId, cost) => {
          setOwnedItemIds((prev) => new Set(prev).add(itemId))
          setCurrentBalance((prev) => prev - cost)
        }}
        onEquipChange={setEquippedMiniBgId}
      />

      {/* Tarefas diárias reais — mesmo estado de daily_missions, feito/pendente hoje.

          `id="tarefas"`: alvo do botão "Ver tarefas de hoje" da vitrine de
          Molduras de Ofensiva, que fica ACIMA nesta mesma página. Antes ele
          apontava para /conquistas, que não tem missão nenhuma — a pessoa
          clicava e caía numa tela sem o que o botão prometia. */}
      <div id="tarefas" className="scroll-mt-20 space-y-3">
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

      {/* Conquistas especiais binárias (YouTube e Discord) — uma lista só, no
          mesmo formato das tarefas acima. Cada uma continua com o próprio
          OAuth e a própria cor; o que foi unificado é a apresentação. */}
      <CommunityAchievements
        youtubeEnabled={isYoutubeSubscriptionEnabled()}
        youtubeConfirmed={youtubeConfirmed}
        discordEnabled={discordEnabled}
        discordConfirmed={discordOk}
        discordInviteUrl={discordInviteUrl}
        requireLogin={requireLogin}
      />

      {/* Programa de Indicação: outra forma de ganhar Aura fora do loop de
          posts/comentários, mesma família das conquistas acima. Só o resumo —
          a mecânica inteira é explicada em /indicar. */}
      <ReferralAuraCard />
    </div>
    <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    <AuraRankingModal open={rankingOpen} onOpenChange={setRankingOpen} />
    </>
  )
}
