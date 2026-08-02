"use client"

import Link from "next/link"
import { Crown, Eye, Flame, Sparkles, Users } from "lucide-react"

import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { profileAccentHue } from "@/lib/user-directory"
import { cn } from "@/lib/utils"
import type { MiniProfile } from "@/lib/mini-profile"

const TIER_RING = {
  common: "ring-background",
  vip: "ring-amber-400/70",
  vip_plus: "ring-fuchsia-400/70",
} as const

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

/**
 * Mini Perfil — cartão compacto de preview rápido, no conceito de "Profile
 * Background" da Steam.
 *
 * O fundo é o `mini_banner_url`: uma imagem enviada à parte da capa grande do
 * perfil (`banner_url`), e que anima quando é GIF de uma conta VIP. Quem não
 * enviou nada cai numa cor derivada do id — a mesma do card de `/pessoas`, então
 * o perfil tem sempre a mesma identidade visual nos dois lugares.
 *
 * Este componente é só apresentação: quem decide quando ele aparece é o
 * `MiniProfileHoverCard`. Ele nunca deve ser usado dentro da página de perfil
 * completa, que já mostra a capa grande.
 */
export function MiniProfileCard({ profile }: { profile: MiniProfile }) {
  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier)
  const background = resolveProfileMedia(profile.mini_banner_url, profile.account_tier)
  const hue = profileAccentHue(profile.id)
  const isVip = profile.account_tier !== "common"
  const specialTag = getSpecialTag(profile.display_slug)
  const initials =
    profile.display_name.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) ||
    "?"

  return (
    <Link
      href={profilePath(profile.display_slug)}
      className="block w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
    >
      {/* Fundo do Mini Perfil. A cor fica sempre atrás para que uma imagem
          ausente — ou que falhe ao carregar — descubra o gradiente em vez de
          um retângulo vazio. */}
      <div
        className="relative h-24 w-full overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 45% / 0.85), hsl(${(hue + 45) % 360} 60% 30% / 0.55))`,
        }}
      >
        <ImageWithFallback
          src={background.src}
          alt=""
          fill
          unoptimized={background.animated}
          sizes="256px"
          className="h-full w-full object-cover object-center"
          fallback={null}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card to-transparent" />
      </div>

      <div className="-mt-9 flex flex-col items-center px-3 pb-3">
        <div
          className={cn(
            "relative size-[72px] overflow-hidden rounded-full bg-muted ring-4",
            TIER_RING[profile.account_tier]
          )}
        >
          <ImageWithFallback
            src={avatar.src}
            alt={profile.display_name}
            fill
            unoptimized={avatar.animated}
            sizes="72px"
            className="object-cover"
            fallback={
              <div
                className="flex size-full items-center justify-center text-xl font-bold text-white/90"
                style={{
                  backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 45) % 360} 50% 28%))`,
                }}
              >
                {initials}
              </div>
            }
          />
        </div>

        <p className="mt-2 flex w-full items-center justify-center gap-1 text-sm font-bold leading-tight text-foreground">
          <span className="truncate">{profile.display_name}</span>
          {isVip && <Crown className="size-3.5 shrink-0 text-amber-400" />}
          {specialTag && <Sparkles className="size-3.5 shrink-0 text-cyan-400" />}
        </p>

        {profile.bio && (
          <p className="mt-1 line-clamp-2 text-center text-[11px] leading-snug text-muted-foreground">
            {profile.bio}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Flame className="size-3 text-orange-500" fill="currentColor" strokeWidth={1.5} />
            <span className="font-semibold text-orange-500">{formatCount(profile.aura)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            <span className="font-semibold text-foreground/70">
              {formatCount(profile.followers)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="size-3" />
            <span className="font-semibold text-foreground/70">
              {formatCount(profile.profile_views)}
            </span>
          </span>
        </div>
      </div>
    </Link>
  )
}
