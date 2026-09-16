"use client"

import { useState } from "react"
import { Bird, Crown, Frame, Lock, Star, Trophy } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { AuraItemCard } from "@/components/aura/AuraItemCard"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import {
  RANK_FRAMES,
  STREAK_FRAMES,
  VIP_FOUNDER_DEADLINE_LABEL,
  VIP_FOUNDER_FRAME,
  VIP_FRAME,
  highestStreakMilestone,
  isVipFounderWindowOpen,
  streakFrameSlug,
  type ProfileFrame,
} from "@/lib/profile-frames"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

interface AvatarFrameSectionProps {
  /** Itens de kind `avatar_frame` do catálogo — as molduras COMPRÁVEIS. */
  items: AuraItem[]
  balance: number
  isVip: boolean
  ownedItemIds: Set<string>
  equippedItemId: string | null
  /** Avatar do próprio usuário, para os previews mostrarem a foto dele. */
  currentUserAvatarUrl: string | null
  currentUserName: string
  requireLogin: () => boolean
  onRedeemed: (itemId: string, cost: number) => void
  onEquipChange: (nextEquippedId: string | null) => void
  /** Abre o modal de benefícios do VIP (mesmo CTA do restante da Central). */
  onShowVipBenefits: () => void
  /**
   * Id do item `vip:founder` no catálogo — `null` se a migration ainda não
   * rodou. Necessário para saber se o usuário a possui (`ownedItemIds`) e
   * para equipá-la, já que ela é posse de verdade, não um `if` de tela.
   */
  founderItemId: string | null
  /**
   * Ids das molduras de Ofensiva por slug (`streak:10` → uuid) — mesmo papel
   * de `founderItemId`: elas não vêm em `items` (linhas `active = false`).
   */
  streakFrameItemIds: Record<string, string>
  /**
   * RECORDE de ofensiva do usuário. É o que decide quais marcos ele já bateu,
   * e nunca a ofensiva viva: um marco alcançado não se desfaz.
   */
  longestStreak: number
}

/**
 * Seção "Molduras" da Central de Aura.
 *
 * Mostra as TRÊS origens de moldura juntas (ver `lib/profile-frames.ts`), e
 * não só as compráveis — sem isso não há nenhuma tela que explique o que cada
 * moldura é nem como se consegue.
 *
 * - **Compráveis** — itens `avatar_frame`, resgatados com Aura e equipáveis.
 * - **VIP** — mostrada com o CTA "Virar VIP" (ou "Você já tem" para o
 *   assinante), nunca com preço: não se compra com Aura.
 * - **Rank** — vitrine do que vem por aí. NÃO são concedidas hoje: nenhum
 *   avatar ganha moldura por colocação (ver `resolveProfileFrame`), então
 *   aqui elas aparecem como prévia, com o critério explícito.
 */
export function AvatarFrameSection({
  items,
  balance,
  isVip,
  ownedItemIds,
  equippedItemId,
  currentUserAvatarUrl,
  currentUserName,
  requireLogin,
  onRedeemed,
  onEquipChange,
  onShowVipBenefits,
  founderItemId,
  streakFrameItemIds,
  longestStreak,
}: AvatarFrameSectionProps) {
  const windowOpen = isVipFounderWindowOpen()
  const ownsFounder = founderItemId ? ownedItemIds.has(founderItemId) : false
  // O maior marco batido — decide o que a vitrine mostra como conquistado e
  // qual moldura o botão "Equipar" coloca.
  const reachedMilestone = highestStreakMilestone(longestStreak)
  const reachedFrame =
    reachedMilestone === null
      ? null
      : (STREAK_FRAMES.find((frame) => frame.slug === streakFrameSlug(reachedMilestone)) ?? null)
  const reachedItemId = reachedFrame ? (streakFrameItemIds[reachedFrame.slug] ?? null) : null
  return (
    <div id="molduras" className="scroll-mt-20 space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">Molduras</h2>
          <span className="flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            <Frame className="size-2.5" />
            Aparece na sua foto em todo o site
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Uma moldura por vez. A que você equipar tem prioridade sobre a de VIP.
        </p>
      </div>

      {/* Compráveis primeiro: é o que a pessoa pode levar agora. */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <AuraItemCard
              key={item.id}
              item={item}
              balance={balance}
              isVip={isVip}
              owned={ownedItemIds.has(item.id)}
              equipped={equippedItemId === item.id}
              requireLogin={requireLogin}
              onRedeemed={(cost) => onRedeemed(item.id, cost)}
              onEquipChange={onEquipChange}
            />
          ))}
        </div>
      )}

      {/* Fundador — primeiro entre as não-compráveis: é a única com PRAZO.
          Depois da janela ela some da vitrine para quem não tem: anunciar uma
          honraria que ninguém mais consegue obter só frustra. */}
      {(windowOpen || ownsFounder) && (
        <FrameShowcase
          title="Moldura de Fundador"
          subtitle={
            ownsFounder
              ? "Você assinou o VIP na janela de lançamento. Ela é sua para sempre, mesmo que a assinatura acabe."
              : `Só para quem assinar o VIP até ${VIP_FOUNDER_DEADLINE_LABEL}. Depois disso não é mais concedida a ninguém.`
          }
          icon={Star}
          frames={[VIP_FOUNDER_FRAME]}
          avatarUrl={currentUserAvatarUrl}
          name={currentUserName}
          highlight
          badgeLabel={windowOpen ? "Por tempo limitado" : "Janela encerrada"}
          action={
            ownsFounder && founderItemId ? (
              <GrantedFrameEquipButton
                itemId={founderItemId}
                equipped={equippedItemId === founderItemId}
                requireLogin={requireLogin}
                onEquipChange={onEquipChange}
                frameName={VIP_FOUNDER_FRAME.name}
                icon={Star}
                equippedClassName="border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                idleClassName="border border-border text-foreground hover:border-amber-400/40 hover:text-amber-300"
              />
            ) : (
              <button
                type="button"
                onClick={onShowVipBenefits}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-black transition-opacity hover:opacity-90"
                style={{ backgroundColor: "oklch(0.86 0.15 88)" }}
              >
                <Star className="size-3" />
                Virar VIP e ser Fundador
              </button>
            )
          }
        />
      )}

      {/* Exclusiva de assinatura */}
      <FrameShowcase
        title="Exclusiva do VIP"
        subtitle="Vem junto com a assinatura. Não se compra com Aura."
        icon={Crown}
        frames={[VIP_FRAME]}
        avatarUrl={currentUserAvatarUrl}
        name={currentUserName}
        action={
          isVip ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
              <Crown className="size-3" />
              Você já tem
            </span>
          ) : (
            <button
              type="button"
              onClick={onShowVipBenefits}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-black transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--vip-accent)" }}
            >
              <Crown className="size-3" />
              Virar VIP
            </button>
          )
        }
      />

      {/* Ofensiva — CONCEDIDAS de verdade, por marco de dias. Vêm logo depois
          das de assinatura porque são a única honraria que qualquer pessoa
          alcança só usando o site: quem ainda não tem vê exatamente quantos
          dias faltam, em vez de uma vitrine que só diz "vire VIP". */}
      <FrameShowcase
        title="Molduras de Ofensiva"
        subtitle={
          reachedMilestone === null
            ? "Complete as 3 missões diárias para começar uma ofensiva. Cada marco de dias libera uma moldura — e ela fica com você para sempre, mesmo que a ofensiva acabe."
            : `Seu recorde é de ${longestStreak} dia${longestStreak === 1 ? "" : "s"}. As molduras que você já desbloqueou são suas para sempre, mesmo que a ofensiva acabe.`
        }
        icon={Bird}
        frames={STREAK_FRAMES}
        avatarUrl={currentUserAvatarUrl}
        name={currentUserName}
        badgeLabel="Por conquista"
        // Marco ainda não batido aparece apagado, com "faltam N dias": é o
        // que transforma a vitrine em meta em vez de catálogo.
        frameLockedLabel={(frame) => {
          const milestone = Number(frame.slug.split(":")[1])
          if (longestStreak >= milestone) return null
          const missing = milestone - longestStreak
          return `faltam ${missing} dia${missing === 1 ? "" : "s"}`
        }}
        // CADA marco desbloqueado é equipável, não só o maior. A posse no
        // banco já é das quatro (o trigger concede todos os marcos que o
        // recorde alcança), então oferecer só a mais alta escondia do dono
        // três molduras que são dele — quem tem 50 dias pode preferir exibir
        // o anel discreto de 1 dia, e não tinha como.
        frameAction={(frame) => {
          const milestone = Number(frame.slug.split(":")[1])
          if (longestStreak < milestone) return null
          const itemId = streakFrameItemIds[frame.slug] ?? null
          if (!itemId) return null
          return (
            <FrameTileEquipButton
              itemId={itemId}
              equipped={equippedItemId === itemId}
              requireLogin={requireLogin}
              onEquipChange={onEquipChange}
              frameName={frame.name}
            />
          )
        }}
        action={
          reachedItemId ? (
            <GrantedFrameEquipButton
              itemId={reachedItemId}
              equipped={equippedItemId === reachedItemId}
              requireLogin={requireLogin}
              onEquipChange={onEquipChange}
              frameName={reachedFrame?.name ?? "Ofensiva"}
              icon={Bird}
              equippedClassName="border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20"
              idleClassName="border border-border text-foreground hover:border-cyan-400/40 hover:text-cyan-300"
            />
          ) : (
            // Âncora na MESMA página (as tarefas diárias ficam logo abaixo),
            // e não /conquistas — aquela tela não tem missão nenhuma.
            <a
              href="#tarefas"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
            >
              <Bird className="size-3" />
              Ver tarefas de hoje
            </a>
          )
        }
      />

      {/* Concedidas de verdade desde a 20261123000000: entrar no top 3 dá a
          moldura para sempre. O texto não diz mais "em breve" — dizia isso
          quando a concessão estava desligada, e depois de ligada passava a
          impressão de que a moldura é que não tinha lançado, quando o que
          falta é a colocação. */}
      <FrameShowcase
        title="Molduras de ranking"
        subtitle="Entre no top 3 de um placar de todos os tempos e a moldura é sua — para sempre, mesmo que saia do pódio depois."
        icon={Trophy}
        frames={RANK_FRAMES}
        avatarUrl={currentUserAvatarUrl}
        name={currentUserName}
        action={
          <Link
            href="/pessoas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Trophy className="size-3" />
            Ver rankings
          </Link>
        }
      />
    </div>
  )
}

/**
 * Vitrine de molduras que NÃO se compram. Cada uma aparece sobre a foto do
 * próprio usuário — ver a moldura em volta do rosto dele é o que dá vontade
 * de conquistá-la; um PNG solto num quadrado não diz nada.
 */
function FrameShowcase({
  title,
  subtitle,
  icon: Icon,
  frames,
  avatarUrl,
  name,
  action,
  highlight = false,
  badgeLabel,
  frameLockedLabel,
  frameAction,
}: {
  title: string
  subtitle: string
  icon: typeof Crown
  frames: ProfileFrame[]
  avatarUrl: string | null
  name: string
  action: React.ReactNode
  /**
   * Botão próprio de UMA moldura da vitrine, ou `null` quando ela não é
   * equipável (ainda bloqueada, ou sem item no banco).
   *
   * Existe porque uma vitrine de várias molduras possuídas precisa de uma
   * ação POR moldura: com um botão só no cabeçalho, as outras viram enfeite.
   */
  frameAction?: (frame: ProfileFrame) => React.ReactNode
  /** Borda âmbar — só a de Fundador, para separá-la das vitrines perenes. */
  highlight?: boolean
  /** Substitui a pastilha "Não comprável" (ex.: "Por tempo limitado"). */
  badgeLabel?: string
  /**
   * O que falta para destravar esta moldura, ou `null` se já é do usuário.
   *
   * Existe para a vitrine de Ofensiva, onde as quatro molduras aparecem
   * juntas mas só algumas são suas: sem distinguir, a vitrine mentiria sobre
   * o que a pessoa tem. As outras vitrines não passam a prop e seguem
   * mostrando todas acesas.
   */
  frameLockedLabel?: (frame: ProfileFrame) => string | null
}) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border p-4",
        CARD_SURFACE,
        highlight && "border-amber-400/40 bg-amber-400/[0.04]"
      )}
    >
      {/* `flex-1` na coluna de texto, e não só `min-w-0`: sem ela a coluna
          mede pelo conteúdo e empurra a ação para a linha de baixo quando o
          subtítulo é longo — era o que descolava "Ver tarefas de hoje" do
          cabeçalho de Ofensiva enquanto "Ver rankings" ficava à direita. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <Icon className="size-3.5 text-muted-foreground" />
            {title}
            <span
              className={cn(
                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                highlight
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              <Lock className="size-2" />
              {badgeLabel ?? "Não comprável"}
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-3">
        {frames.map((frame) => {
          const lockedLabel = frameLockedLabel?.(frame) ?? null
          return (
            <div key={frame.slug} className="flex w-[68px] flex-col items-center gap-1.5 text-center">
              {/* Apagada, não escondida: ver a moldura que ainda não é sua é
                  o que dá vontade de alcançá-la. */}
              <div className={cn(lockedLabel && "opacity-40 saturate-50")}>
                <ProfileAvatar
                  name={name}
                  avatarUrl={avatarUrl}
                  size="lg"
                  frameOverride={frame}
                />
              </div>
              <span
                className="text-[10px] font-semibold leading-tight text-muted-foreground"
                title={frame.description}
              >
                {frame.name}
              </span>
              {lockedLabel && (
                <span className="text-[9px] font-medium leading-none text-muted-foreground/70">
                  {lockedLabel}
                </span>
              )}
              {!lockedLabel && frameAction?.(frame)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Equipar/remover uma moldura CONCEDIDA (Fundador, marco de Ofensiva).
 *
 * Botão próprio, e não `AuraItemCard`, porque aquele card é construído em
 * volta de um item COMPRÁVEL (preço, saldo, botão "Resgatar") — nada disso
 * existe aqui: a moldura já é posse, e nunca teve preço. O que ele
 * compartilha é o que importa: as MESMAS rotas de equipar/desequipar, para
 * que o slot continue sendo um só e equipar uma concedida tire a cosmética do
 * ar exatamente como uma cosmética tira a outra.
 *
 * É um componente só para as duas origens de propósito: duas cópias do mesmo
 * botão divergiriam no primeiro ajuste, e o slot é um só.
 */
function GrantedFrameEquipButton({
  itemId,
  equipped,
  requireLogin,
  onEquipChange,
  frameName,
  icon: Icon,
  equippedClassName,
  idleClassName,
}: {
  itemId: string
  equipped: boolean
  requireLogin: () => boolean
  onEquipChange: (nextEquippedId: string | null) => void
  /** Nome exibido no toast — diz QUAL moldura foi equipada. */
  frameName: string
  icon: typeof Crown
  /** Cores do estado equipado/ocioso, para o botão seguir a paleta da vitrine. */
  equippedClassName: string
  idleClassName: string
}) {
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (requireLogin()) return
    setLoading(true)
    try {
      const url = equipped ? "/api/aura/items/unequip" : `/api/aura/items/${itemId}/equip`
      const res = await fetch(url, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Erro ao equipar moldura")

      onEquipChange(equipped ? null : itemId)
      toast.success(equipped ? "Moldura removida" : "Moldura equipada", {
        description: frameName,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao equipar moldura")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-60",
        equipped ? equippedClassName : idleClassName
      )}
    >
      <Icon className="size-3" />
      {loading ? "..." : equipped ? "Equipada" : "Equipar"}
    </button>
  )
}

/**
 * Botão compacto de equipar, embaixo de UMA moldura da vitrine.
 *
 * Mesmo comportamento do `GrantedFrameEquipButton` (mesmas rotas, mesmo
 * toggle, mesmo toast) num tamanho que cabe sob um avatar de 68px: a vitrine
 * de Ofensiva mostra quatro molduras lado a lado, e o botão largo do
 * cabeçalho não serve para escolher entre elas.
 */
function FrameTileEquipButton({
  itemId,
  equipped,
  requireLogin,
  onEquipChange,
  frameName,
}: {
  itemId: string
  equipped: boolean
  requireLogin: () => boolean
  onEquipChange: (nextEquippedId: string | null) => void
  frameName: string
}) {
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (requireLogin()) return
    setLoading(true)
    try {
      const url = equipped ? "/api/aura/items/unequip" : `/api/aura/items/${itemId}/equip`
      const res = await fetch(url, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Erro ao equipar moldura")

      onEquipChange(equipped ? null : itemId)
      toast.success(equipped ? "Moldura removida" : "Moldura equipada", { description: frameName })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao equipar moldura")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      title={equipped ? "Clique para remover" : `Equipar ${frameName}`}
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[9px] font-bold transition-colors disabled:opacity-60",
        equipped
          ? "border border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
          : "border border-border text-muted-foreground hover:border-cyan-400/40 hover:text-cyan-300"
      )}
    >
      {loading ? "..." : equipped ? "Equipada" : "Equipar"}
    </button>
  )
}
