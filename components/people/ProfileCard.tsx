"use client"

import Link from "next/link"
import { Crown, Eye, Sparkles, Users } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import { profileAccentHue, type PublicProfileSummary } from "@/lib/user-directory"

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

/** Ouro, prata e bronze para o pódio das listas ranqueadas. */
const RANK_STYLES: Record<number, string> = {
  1: "bg-amber-400 text-amber-950",
  2: "bg-zinc-300 text-zinc-800",
  3: "bg-orange-400/90 text-orange-950",
}

export function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
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
  metric: "views" | "followers"
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
  const value = metric === "views" ? profile.profile_views : profile.followers

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
          <ImageWithFallback
            src={miniBanner.src}
            alt=""
            fill
            unoptimized={miniBanner.animated}
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
            fallback={null}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
        </div>

        {rank !== undefined && (
          <span
            className={cn(
              "absolute left-2.5 top-2.5 flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow-sm",
              RANK_STYLES[rank] ?? "bg-background/80 text-muted-foreground backdrop-blur-sm"
            )}
          >
            {rank}
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

          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            {metric === "views" ? <Eye className="size-3" /> : <Users className="size-3" />}
            <span className="font-semibold text-foreground/70">{formatCount(value)}</span>
            {metric === "views"
              ? value === 1
                ? "visita"
                : "visitas"
              : value === 1
                ? "seguidor"
                : "seguidores"}
          </p>
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
  )
}
