"use client"

import Link from "next/link"
import { Crown, Sparkles } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { formatCount } from "@/components/people/ProfileCard"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import { profileAccentHue, type PublicProfileSummary } from "@/lib/user-directory"

type Place = 1 | 2 | 3

const PODIUM_STYLE: Record<Place, {
  ring: string
  badge: string
  glow: string
  order: string
  pedestal: string
}> = {
  1: {
    ring: "ring-amber-400",
    badge: "bg-amber-400 text-amber-950",
    glow: "shadow-[0_0_32px_-8px_rgba(251,191,36,0.6)]",
    order: "order-2",
    pedestal: "h-14",
  },
  2: {
    ring: "ring-zinc-300",
    badge: "bg-zinc-300 text-zinc-800",
    glow: "shadow-[0_0_20px_-8px_rgba(212,212,216,0.5)]",
    order: "order-1 sm:mb-6",
    pedestal: "h-9",
  },
  3: {
    ring: "ring-orange-400",
    badge: "bg-orange-400/90 text-orange-950",
    glow: "shadow-[0_0_20px_-8px_rgba(251,146,60,0.5)]",
    order: "order-3 sm:mb-9",
    pedestal: "h-6",
  },
}

/**
 * Pódio das listas ranqueadas (aba "Mais visitados" / "Mais seguidos"):
 * os 3 primeiros ganham destaque visual próprio em vez de disputar espaço
 * com um badge numérico igual ao dos demais cards da grade.
 */
export function PodiumSection({
  profiles,
  metric,
  following,
  currentUserId,
}: {
  /** Exatamente os 3 primeiros colocados, em ordem (1º, 2º, 3º). */
  profiles: PublicProfileSummary[]
  metric: "views" | "followers"
  following: Set<string>
  currentUserId: string | null
}) {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {profiles.map((profile, index) => (
        <PodiumCard
          key={profile.id}
          profile={profile}
          place={(index + 1) as Place}
          metric={metric}
          isFollowing={following.has(profile.id)}
          isSelf={profile.id === currentUserId}
        />
      ))}
    </div>
  )
}

function PodiumCard({
  profile,
  place,
  metric,
  isFollowing,
  isSelf,
}: {
  profile: PublicProfileSummary
  place: Place
  metric: "views" | "followers"
  isFollowing: boolean
  isSelf: boolean
}) {
  const style = PODIUM_STYLE[place]
  const isFirst = place === 1
  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier)
  const initials =
    profile.display_name.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) ||
    "?"
  const isVip = profile.account_tier !== "common"
  const specialTag = getSpecialTag(profile.display_slug)
  const hue = profileAccentHue(profile.id)
  const value = metric === "views" ? profile.profile_views : profile.followers

  return (
    <div className={cn("flex w-full max-w-[168px] flex-col items-center", style.order)}>
      <div
        className={cn(
          "relative flex w-full flex-col items-center overflow-hidden rounded-t-2xl border border-b-0 border-border bg-card pb-4 transition-transform duration-200 hover:-translate-y-1",
          style.glow,
          isFirst ? "pt-9" : "pt-7"
        )}
      >
        {isFirst && (
          <Crown className="absolute top-1.5 size-6 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
        )}

        <Link href={profilePath(profile.display_slug)} className="flex flex-col items-center px-2">
          <div
            className={cn(
              "relative overflow-hidden rounded-full bg-muted ring-4 transition-transform duration-200 hover:scale-105",
              style.ring,
              isFirst ? "size-20" : "size-16"
            )}
          >
            <ImageWithFallback
              src={avatar.src}
              alt={profile.display_name}
              fill
              unoptimized={avatar.animated}
              sizes={isFirst ? "80px" : "64px"}
              className="object-cover"
              fallback={
                <div
                  className="flex size-full items-center justify-center text-lg font-bold text-white/90"
                  style={{
                    backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 45) % 360} 50% 28%))`,
                  }}
                >
                  {initials}
                </div>
              }
            />
          </div>

          <p className="mt-2 flex w-full items-center justify-center gap-1 text-[13px] font-bold leading-tight text-foreground">
            <span className="truncate">{profile.display_name}</span>
            {isVip && <Crown className="size-3 shrink-0 text-amber-400" />}
            {specialTag && <Sparkles className="size-3 shrink-0 text-cyan-400" />}
          </p>

          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            <span className="font-semibold text-foreground/70">{formatCount(value)}</span>{" "}
            {metric === "views"
              ? value === 1
                ? "visita"
                : "visitas"
              : value === 1
                ? "seguidor"
                : "seguidores"}
          </p>
        </Link>

        <div className="mt-2 w-full px-2">
          {isSelf ? (
            <p className="rounded-lg border border-dashed border-border py-1 text-center text-[10px] font-medium text-muted-foreground">
              Você
            </p>
          ) : (
            <FollowButton userId={profile.id} initialFollowing={isFollowing} className="w-full text-xs" />
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex w-full items-center justify-center rounded-b-lg text-lg font-black",
          style.badge,
          style.pedestal
        )}
      >
        {place}
      </div>
    </div>
  )
}
