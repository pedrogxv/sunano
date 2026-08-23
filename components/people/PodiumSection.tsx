"use client"

import Link from "next/link"
import { Crown, Sparkles } from "lucide-react"

import { FollowButton } from "@/components/people/FollowButton"
import { ProfileMetrics } from "@/components/people/ProfileCard"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia, isVipActive } from "@/lib/account-tier"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { mediaAdjustStyle } from "@/lib/profile-media-adjust"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import {
  profileAccentHue,
  type DirectoryMetric,
  type PublicProfileSummary,
} from "@/lib/user-directory"

type Place = 1 | 2 | 3

/**
 * O que muda de um lugar para o outro no layout. A *cor* de cada metal não
 * está aqui: vive no CSS (`[data-place]` em globals.css), porque não é uma
 * cor só — é um gradiente animado que o anel, o pedestal e o halo compartilham.
 */
const PODIUM_LAYOUT: Record<
  Place,
  { order: string; pedestal: string; banner: string; avatarOffset: string }
> = {
  1: { order: "order-2", pedestal: "h-16", banner: "h-16", avatarOffset: "-mt-9" },
  2: { order: "order-1 sm:mb-6", pedestal: "h-10", banner: "h-12", avatarOffset: "-mt-7" },
  3: { order: "order-3 sm:mb-9", pedestal: "h-7", banner: "h-12", avatarOffset: "-mt-7" },
}

/** Faíscas do 1º lugar: posição/tamanho/atraso fixos, sem Math.random no render. */
const SPARKLES = [
  { className: "-left-1 top-3 size-3", delay: "0ms" },
  { className: "-right-0.5 top-8 size-2.5", delay: "600ms" },
  { className: "left-4 -top-1 size-2", delay: "1200ms" },
  { className: "right-5 top-1 size-2.5", delay: "1800ms" },
]

/**
 * Pódio das listas ranqueadas (aba "Mais Aura" / "Mais seguidos"): os 3
 * primeiros ganham destaque visual próprio em vez de disputar espaço com um
 * badge numérico igual ao dos demais cards da grade.
 */
export function PodiumSection({
  profiles,
  metric,
  following,
  currentUserId,
  showFollowButton = false,
}: {
  /** Exatamente os 3 primeiros colocados, em ordem (1º, 2º, 3º). */
  profiles: PublicProfileSummary[]
  metric: DirectoryMetric
  following: Set<string>
  currentUserId: string | null
  /** Só a aba "Mais visitados" mostra o botão Seguir nos cards do pódio. */
  showFollowButton?: boolean
}) {
  return (
    <div className="flex items-end justify-center gap-1.5 sm:gap-6">
      {profiles.map((profile, index) => (
        <PodiumCard
          key={profile.id}
          profile={profile}
          place={(index + 1) as Place}
          metric={metric}
          isFollowing={following.has(profile.id)}
          isSelf={profile.id === currentUserId}
          showFollowButton={showFollowButton}
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
  showFollowButton,
}: {
  profile: PublicProfileSummary
  place: Place
  metric: DirectoryMetric
  isFollowing: boolean
  isSelf: boolean
  showFollowButton: boolean
}) {
  const layout = PODIUM_LAYOUT[place]
  const isFirst = place === 1
  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier)
  const miniBanner = resolveProfileMedia(profile.mini_banner_url, profile.account_tier)
  const initials =
    profile.display_name.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) ||
    "?"
  const isVip = isVipActive(profile.account_tier, profile.vip_expires_at)
  const specialTag = getSpecialTag(profile.display_slug)
  const hue = profileAccentHue(profile.id)

  return (
    // `data-place` é o que liga este card ao metal certo: dele descem as
    // variáveis --metal-* que anel, pedestal e halo leem lá embaixo.
    <div
      data-place={place}
      className={cn(
        "podium-halo relative flex w-full max-w-[108px] flex-col items-center sm:max-w-[168px]",
        layout.order
      )}
    >
      {/* Mesmo gesto do card da grade: o top 3 sai da grade e vira pódio, mas
          continua sendo um card de pessoa — passar o mouse nele abre o Mini
          Perfil igual. */}
      <MiniProfileHoverCard slug={profile.display_slug} side="right">
        <div
          className={cn(
            "relative flex w-full flex-col items-center rounded-t-2xl border border-b-0 border-border bg-card pb-4 transition-transform duration-200 hover:-translate-y-1"
          )}
        >
          {isFirst && (
            <>
              <Crown className="podium-crown absolute top-1.5 size-6" fill="currentColor" strokeWidth={1.25} />
              {SPARKLES.map((sparkle) => (
                <Sparkles
                  key={sparkle.className}
                  aria-hidden
                  style={{ animationDelay: sparkle.delay }}
                  className={cn("podium-sparkle", sparkle.className)}
                  fill="currentColor"
                  strokeWidth={0}
                />
              ))}
            </>
          )}

          {/* Mesmo banner do card padrão (ProfileCard): fica em fluxo normal
              e o avatar sobe por cima dele com margem negativa, em vez de
              `absolute` — um elemento posicionado sem z-index pintaria por
              cima do avatar/nome mesmo vindo antes no DOM. */}
          <div
            className={cn("relative w-full overflow-hidden rounded-t-2xl", layout.banner)}
            style={{
              backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 45% / 0.85), hsl(${(hue + 45) % 360} 60% 30% / 0.55))`,
            }}
          >
            <ImageWithFallback
              src={miniBanner.src}
              alt=""
              fill
              unoptimized={miniBanner.animated}
              sizes="168px"
              style={mediaAdjustStyle(profile.media_adjustments.mini_banner)}
              className="object-cover"
              fallback={null}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          </div>

          <Link
            href={profilePath(profile.display_slug)}
            className={cn("flex flex-col items-center px-2", layout.avatarOffset)}
          >
            {/* O anel metálico é um elemento atrás do avatar, não um `ring`:
                gradiente animado não cabe numa borda, e mantê-lo por baixo
                impede que o lustro do metal passe por cima da foto. */}
            <div className={cn("group relative", isFirst ? "size-20" : "size-16")}>
              <span
                aria-hidden
                className="podium-metal absolute -inset-[5px] rounded-full transition-transform duration-200 group-hover:scale-105"
              />
              <div className="relative size-full overflow-hidden rounded-full bg-muted transition-transform duration-200 group-hover:scale-105">
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
            </div>

            <p className="mt-2 flex w-full items-center justify-center gap-1 text-[13px] font-bold leading-tight text-foreground">
              <span className="truncate">{profile.display_name}</span>
              {isVip && <Crown className="size-3 shrink-0" style={{ color: "var(--vip-accent)" }} />}
              {specialTag && <Sparkles className="size-3 shrink-0 text-cyan-400" />}
            </p>

            <ProfileMetrics profile={profile} metric={metric} compact />
          </Link>

          {showFollowButton && (
            <div className="mt-2 w-full px-2">
              {isSelf ? (
                <p className="rounded-lg border border-dashed border-border py-1 text-center text-[10px] font-medium text-muted-foreground">
                  Você
                </p>
              ) : (
                <FollowButton userId={profile.id} initialFollowing={isFollowing} className="w-full text-xs" />
              )}
            </div>
          )}
        </div>
      </MiniProfileHoverCard>

      <div
        className={cn(
          "podium-metal flex w-full items-center justify-center rounded-b-lg text-lg font-black",
          layout.pedestal
        )}
      >
        <span className="podium-number">{place}</span>
      </div>
    </div>
  )
}
