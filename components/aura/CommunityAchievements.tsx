"use client"

import { Check, Youtube } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { DiscordIcon } from "@/components/auth/provider-icons"
import { YoutubeSubscribeButton } from "@/components/auth/YoutubeSubscribeButton"
import { DiscordMembershipButton } from "@/components/auth/DiscordMembershipButton"

/**
 * Conquistas especiais de comunidade — binárias (sem tiers, diferente de
 * `AchievementsGrid`) e resgatáveis uma única vez. Antes eram dois cards
 * grandes soltos (`YoutubeSubscriptionCard`/`DiscordMembershipCard`), o que
 * repetia moldura, cor e explicação duas vezes seguidas. Aqui viram linhas
 * de uma lista só, no mesmo formato de "Tarefas de hoje" logo acima.
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
}

export function CommunityAchievements({
  youtubeEnabled,
  youtubeConfirmed,
  discordEnabled,
  discordConfirmed,
  discordInviteUrl,
  requireLogin,
  className,
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Conquistas da comunidade</h2>
        <span className="text-xs font-semibold text-muted-foreground">
          {doneCount}/{achievements.length} conquistadas
        </span>
      </div>
      <div className={cn("divide-y divide-border overflow-hidden rounded-2xl border", CARD_SURFACE)}>
        {achievements.map((a) => (
          <div
            key={a.key}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
              a.done && "bg-emerald-400/[0.04]"
            )}
          >
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
              <p className={cn("text-sm", a.done ? "text-muted-foreground" : "text-foreground")}>{a.label}</p>
              {!a.done && <p className="text-xs text-muted-foreground">{a.hint}</p>}
            </div>
            {a.done ? (
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs font-bold text-emerald-300">
                Conquistado
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-bold", a.accent.text)}>+50</span>
                {a.action}
              </div>
            )}
            {!a.done && a.extra && <div className="basis-full pl-11 sm:basis-auto sm:pl-0">{a.extra}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
