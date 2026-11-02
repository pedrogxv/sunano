"use client"

import { Check, Medal, Youtube } from "lucide-react"

import { cn } from "@/lib/utils"
import { LaneProgress, PrizeLaneHeader } from "@/components/aura/PrizeLaneHeader"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { DiscordIcon } from "@/components/auth/provider-icons"
import { YoutubeSubscribeButton } from "@/components/auth/YoutubeSubscribeButton"
import { DiscordMembershipButton } from "@/components/auth/DiscordMembershipButton"

/**
 * Conquistas especiais de comunidade — binárias (sem tiers, diferente de
 * `AchievementsGrid`) e resgatáveis uma única vez. Antes eram dois cards
 * grandes soltos (`YoutubeSubscriptionCard`/`DiscordMembershipCard`), o que
 * repetia moldura, cor e explicação duas vezes seguidas. Aqui viram linhas
 * de uma lista só, no mesmo formato de "Missões diárias" ao lado.
 *
 * Aglutinado no UX, separado no fluxo: cada linha mantém o próprio OAuth
 * (scopes e callbacks distintos, ver os dois botões), a própria cor de marca
 * e o próprio texto — o que muda é só a densidade visual.
 */

type Achievement = {
  key: "youtube" | "discord"
  label: string
  /** Cor da marca, aplicada ao ícone/selo. Literal porque Tailwind não lê classe montada em runtime. */
  accent: { border: string; bg: string; text: string; solid: string }
  icon: React.ReactNode
  done: boolean
  /** Texto curto do que falta fazer; some quando conquistado. */
  hint: string
  action: React.ReactNode
  /** Link auxiliar opcional (ex.: convite do servidor). */
  extra?: React.ReactNode
}

interface CommunityAchievementsProps {
  youtubeEnabled: boolean
  youtubeConfirmed: boolean
  discordEnabled: boolean
  discordConfirmed: boolean
  discordInviteUrl?: string | null
  requireLogin?: () => boolean
  className?: string
  /** Faixa dentro de um painel (`AuraHub`). */
  lane?: boolean
}

export function CommunityAchievements({
  youtubeEnabled,
  youtubeConfirmed,
  discordEnabled,
  discordConfirmed,
  discordInviteUrl,
  requireLogin,
  className,
  lane = false,
}: CommunityAchievementsProps) {
  const achievements: Achievement[] = []

  if (youtubeEnabled) {
    achievements.push({
      key: "youtube",
      label: "Inscrito no canal",
      accent: {
        border: "border-red-600/40",
        bg: "bg-red-600/10",
        text: "text-red-500",
        solid: "bg-red-600",
      },
      icon: <Youtube className="size-4" />,
      done: youtubeConfirmed,
      hint: "Confirme sua inscrição no YouTube do Sunano",
      action: <YoutubeSubscribeButton requireLogin={requireLogin} className="px-3 py-1.5 text-xs" />,
    })
  }

  if (discordEnabled) {
    achievements.push({
      key: "discord",
      label: "No Discord",
      accent: {
        border: "border-[#5865F2]/40",
        bg: "bg-[#5865F2]/10",
        text: "text-[#5865F2]",
        solid: "bg-[#5865F2]",
      },
      icon: <DiscordIcon className="size-4" fill="currentColor" />,
      done: discordConfirmed,
      hint: "Conecte seu Discord e confirme que está no servidor",
      action: <DiscordMembershipButton requireLogin={requireLogin} className="px-3 py-1.5 text-xs" />,
      extra: discordInviteUrl ? (
        <a
          href={discordInviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Entrar no servidor
        </a>
      ) : null,
    })
  }

  if (achievements.length === 0) return null

  const doneCount = achievements.filter((a) => a.done).length

  return (
    <div className={cn("space-y-3", className)}>
      {lane ? (
        <PrizeLaneHeader
          icon={<Medal className="size-4" />}
          iconClassName="bg-gradient-to-br from-sky-300 to-indigo-600 text-[#03122a] shadow-[0_0_16px_-4px] shadow-sky-500/70"
          title="Conquistas"
          tag="Uma vez só"
          tagClassName="bg-sky-500/10 text-sky-200 ring-1 ring-sky-400/30"
          right={<LaneProgress done={doneCount} total={achievements.length} label="conquistadas" />}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">Conquistas da comunidade</h2>
          <span className="text-xs font-semibold text-muted-foreground">
            {doneCount}/{achievements.length} conquistadas
          </span>
        </div>
      )}
      <div
        className={cn(
          "divide-y overflow-hidden",
          lane ? "aura-hub-well divide-white/[0.06]" : cn("divide-border rounded-2xl border", CARD_SURFACE)
        )}
      >
        {achievements.map((a) => (
          // Dois andares: em cima o que é (ícone, nome, dica, recompensa), embaixo
          // o que fazer. Numa linha só, botão + link + recompensa espremiam a
          // dica em cinco linhas na coluna estreita do painel.
          <div key={a.key} className={cn("px-4 py-3", a.done && "bg-emerald-400/[0.04]")}>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                  a.done
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                    : cn(a.accent.border, a.accent.bg, a.accent.text)
                )}
              >
                {a.done ? <Check className="size-4" /> : a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", a.done ? "text-muted-foreground" : "font-medium text-foreground")}>
                  {a.label}
                </p>
                {!a.done && <p className="text-xs leading-snug text-muted-foreground">{a.hint}</p>}
              </div>
              {/* Mesma pílula das Missões diárias: a recompensa é Aura, não a cor da marca. */}
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                  a.done ? "bg-emerald-400/10 text-emerald-300" : "bg-orange-500/10 text-orange-400"
                )}
              >
                {a.done ? "Conquistado" : "+50"}
              </span>
            </div>
            {!a.done && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 pl-11">
                {a.action}
                {a.extra}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
