"use client"

import Link from "next/link"
import { Activity, Crown, Eye, Flame, Sparkles, Users } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia } from "@/lib/account-tier"
import { mediaAdjustStyle } from "@/lib/profile-media-adjust"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import {
  profileAccentHue,
  type DirectoryMetric,
  type PublicProfileSummary,
} from "@/lib/user-directory"

const TIER_RING = {
  common: "ring-background",
  vip: "ring-amber-400/70",
  vip_plus: "ring-fuchsia-400/70",
} as const

/**
 * Matiz do neon. Contas VIP acendem na cor do próprio tier (âmbar/fúcsia);
 * as demais acendem na cor que o card já usa na faixa e nas iniciais, então
 * a luz parece emitida pelo próprio card.
 */
const TIER_GLOW_HUE: Record<string, number> = { vip: 45, vip_plus: 300 }

/**
 * Ouro, prata e bronze do badge de posição. Só aparecem quando a lista é curta
 * demais para montar o pódio (< 3 perfis); acima disso o top 3 sai da grade e
 * vira PodiumSection. `podium-metal` é o mesmo metal animado do pódio
 * (globals.css), então as duas formas de mostrar o top 3 combinam.
 */
const TOP_RANKS = [1, 2, 3]

export function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

const METRIC_META: Record<
  DirectoryMetric,
  { icon: React.ElementType; filled?: true; tone?: string; label: (n: number) => string }
> = {
  // Laranja de fogo (o mesmo tom das partículas do AuraButton) em vez de
  // `text-primary`: no tema escuro `primary` é branco, e uma chama branca não
  // diz "aura" nenhuma.
  aura: { icon: Flame, filled: true, tone: "text-orange-500", label: () => "aura" },
  views: { icon: Eye, label: (n) => (n === 1 ? "visita" : "visitas") },
  followers: { icon: Users, label: (n) => (n === 1 ? "seguidor" : "seguidores") },
  activity: { icon: Activity, tone: "text-emerald-400", label: () => "atividade" },
}

function metricValue(profile: PublicProfileSummary, metric: DirectoryMetric): number {
  if (metric === "aura") return profile.aura
  if (metric === "views") return profile.profile_views
  if (metric === "activity") return profile.activity
  return profile.followers
}

/**
 * O número sob o nick: só a métrica da aba em destaque. Sem métrica
 * secundária — é a única informação do card, então ganha ícone e número
 * grandes em vez de disputar espaço com uma segunda linha apagada.
 * `compact` é a variação do pódio, onde os cards são menores.
 */
export function ProfileMetrics({
  profile,
  metric,
  compact = false,
}: {
  profile: PublicProfileSummary
  metric: DirectoryMetric
  compact?: boolean
}) {
  const meta = METRIC_META[metric]
  const Icon = meta.icon
  const value = metricValue(profile, metric)

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1.5 text-muted-foreground",
        compact ? "text-xs" : "text-sm"
      )}
    >
      <Icon
        className={cn(compact ? "size-4" : "size-5", meta.tone)}
        {...(meta.filled ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
      />
      <span
        className={cn(
          "font-extrabold",
          compact ? "text-base" : "text-lg",
          meta.tone ?? "text-foreground"
        )}
      >
        {formatCount(value)}
      </span>
      {meta.label(value)}
    </p>
  )
}

/**
 * Card do diretório de pessoas: faixa colorida (mini banner, ou uma cor
 * derivada do id quando não há), avatar circular grande, nick e a métrica
 * da aba atual.
 */
export function ProfileCard({
  profile,
  metric,
  rank,
  isFollowing = false,
  isSelf = false,
}: {
  profile: PublicProfileSummary
  /** Qual número aparece sob o nick — acompanha a aba selecionada. */
  metric: DirectoryMetric
  /** Posição na lista ranqueada. Ausente em listas sem ordem de mérito. */
  rank?: number
  isFollowing?: boolean
  /** Esconde o botão: ninguém segue a si mesmo. */
  isSelf?: boolean
}) {

  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier)
  const miniBanner = resolveProfileMedia(profile.mini_banner_url, profile.account_tier)
  const initials =
    profile.display_name.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) ||
    "?"
  const isVip = profile.account_tier !== "common"
  const specialTag = getSpecialTag(profile.display_slug)
  const hue = profileAccentHue(profile.id)
  const glowHue = TIER_GLOW_HUE[profile.account_tier] ?? hue

  // A cor do neon é dinâmica (vem do perfil), então o Tailwind não consegue
  // gerar a classe no build: as intensidades ficam em classes estáticas que
  // leem estas variáveis. Os valores espelham `glow`/`glowHover` de
  // lib/tierlist-theme.ts, que é o neon dos cards da tierlist.
  const neon = {
    "--glow": `0 0 12px hsl(${glowHue} 80% 55% / 0.15)`,
    "--glow-hover": `0 0 10px 2px hsl(${glowHue} 85% 60% / 0.85), 0 0 28px 6px hsl(${glowHue} 85% 60% / 0.6), 0 0 60px 16px hsl(${glowHue} 85% 60% / 0.35)`,
    "--glow-border": `hsl(${glowHue} 85% 60%)`,
  } as React.CSSProperties

  return (
    // O cartão inteiro abre o Mini Perfil: passar o mouse em qualquer canto
    // basta, não só na foto. `side="right"` para o cartão não cobrir o card
    // que o abriu.
    <MiniProfileHoverCard slug={profile.display_slug} side="right">
      <div
        style={neon}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
          "transition-all duration-[220ms] ease-out hover:z-10 hover:-translate-y-1",
          "shadow-[var(--glow)] hover:border-[var(--glow-border)] hover:shadow-[var(--glow-hover)]"
        )}
      >
        <Link href={profilePath(profile.display_slug)} className="flex flex-col items-center">
          {/* Faixa: mini banner por cima da cor do próprio perfil. A cor fica
              sempre no fundo para que uma imagem ausente — ou que falhe ao
              carregar — descubra o gradiente em vez de um vazio. */}
          <div
            className="relative h-20 w-full overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 45% / 0.85), hsl(${(hue + 45) % 360} 60% 30% / 0.55))`,
            }}
          >
            {/* Duas camadas de transform: o zoom do enquadramento é `style`
                inline na imagem e venceria a classe de hover se estivessem no
                mesmo elemento. O wrapper fica com o crescer-ao-passar-o-mouse. */}
            <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-110">
              <ImageWithFallback
                src={miniBanner.src}
                alt=""
                fill
                unoptimized={miniBanner.animated}
                sizes="(max-width: 640px) 50vw, 240px"
                style={mediaAdjustStyle(profile.media_adjustments.mini_banner)}
                className="object-cover"
                fallback={null}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          </div>

          {rank !== undefined && (
            <span
              data-place={TOP_RANKS.includes(rank) ? rank : undefined}
              className={cn(
                "absolute left-2.5 top-2.5 flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow-sm",
                TOP_RANKS.includes(rank)
                  ? "podium-metal"
                  : "bg-background/80 text-muted-foreground backdrop-blur-sm"
              )}
            >
              <span className={cn(TOP_RANKS.includes(rank) && "podium-number")}>{rank}</span>
            </span>
          )}

          <div className="-mt-11 flex flex-col items-center px-3">
            <div
              className={cn(
                "relative size-[86px] overflow-hidden rounded-full bg-muted ring-4 transition-transform duration-200 group-hover:scale-105",
                TIER_RING[profile.account_tier]
              )}
            >
              <ImageWithFallback
                src={avatar.src}
                alt={profile.display_name}
                fill
                unoptimized={avatar.animated}
                sizes="86px"
                style={mediaAdjustStyle(profile.media_adjustments.avatar)}
                className="object-cover"
                fallback={
                  <div
                    className="flex size-full items-center justify-center text-2xl font-bold text-white/90"
                    style={{
                      backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 45) % 360} 50% 28%))`,
                    }}
                  >
                    {initials}
                  </div>
                }
              />
            </div>

            <p className="mt-2.5 flex w-full items-center justify-center gap-1 text-[15px] font-bold leading-tight text-foreground">
              <span className="truncate">{profile.display_name}</span>
              {isVip && <Crown className="size-3.5 shrink-0 text-amber-400" />}
              {specialTag && <Sparkles className="size-3.5 shrink-0 text-cyan-400" />}
            </p>

            <ProfileMetrics profile={profile} metric={metric} />
          </div>
        </Link>

        <div className="mt-3 px-3 pb-3">
          {isSelf ? (
            <p className="rounded-lg border border-dashed border-border py-1.5 text-center text-[11px] font-medium text-muted-foreground">
              Você
            </p>
          ) : (
            <FollowButton userId={profile.id} initialFollowing={isFollowing} className="w-full" />
          )}
        </div>
      </div>
    </MiniProfileHoverCard>
  )
}
