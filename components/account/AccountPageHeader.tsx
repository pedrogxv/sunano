"use client"

import Image from "next/image"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

import type { ProfileData } from "./ProfileSection"
import { useAuthUser } from "@/components/providers/auth-context"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import {
  coerceAccountTier,
  getTierCapabilities,
  resolveProfileMedia,
} from "@/lib/account-tier"
import { coerceMediaAdjustments, mediaAdjustStyle } from "@/lib/profile-media-adjust"
import { profileFrameOf } from "@/lib/profile-frames"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { profileAccentHue } from "@/lib/user-directory"
import { cn } from "@/lib/utils"

/**
 * Cabeçalho compartilhado por /perfil e /conta — quem é você, com atalho
 * para o perfil público.
 *
 * É um hero, não uma linha de texto: a capa que a pessoa escolheu entra de
 * fundo (velada, para o texto ter contraste) e a foto sai do `Avatar` cru do
 * shadcn para o `ProfileAvatar`, que é o componente de foto do site
 * (`AGENTS.md`). O header antigo montava `AvatarImage` + iniciais à mão — e
 * por isso era o único lugar do site onde o Fundador aparecia SEM moldura,
 * justo na tela em que ele acabou de equipá-la.
 *
 * Sem capa a faixa vira o mesmo degradê de accent que o card de /pessoas usa
 * de fallback: o hero nunca fica um retângulo cinza.
 */
export function AccountPageHeader({
  profile,
  /**
   * Largura do miolo. Acompanha o container da página logo abaixo, senão o
   * nome do hero não fica alinhado com o conteúdo — `/perfil` usa `max-w-7xl`
   * desde que o editor virou duas colunas; o resto de `/conta` segue em
   * `max-w-4xl`.
   */
  width = "max-w-4xl",
}: {
  profile: ProfileData
  width?: string
}) {
  const { user: authUser } = useAuthUser()
  const name = profile.display_name?.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const tier = coerceAccountTier(profile.account_tier)
  const tierLabel = getTierCapabilities(tier).label
  const specialTag = getSpecialTag(profile.display_slug)
  const accentHue = profile.id ? profileAccentHue(profile.id) : 210

  // A moldura vem do contexto de sessão, igual ao preview do editor: é a
  // mesma que o site inteiro desenha, inclusive as de arte em código
  // (Fundador, VIP), que não têm URL.
  const frame = profileFrameOf({
    equippedFrameSlug: authUser?.equippedFrameSlug,
    equippedFrameUrl: authUser?.equippedFrameUrl,
    accountTier: authUser?.accountTier ?? profile.account_tier,
    vipExpiresAt: authUser?.vipExpiresAt ?? profile.vip_expires_at ?? null,
    isFounder: authUser?.isFounder,
    longestStreak: authUser?.longestStreak,
    frameOptOut: authUser?.frameOptOut,
  })

  // Passa pelas mesmas regras de tier do perfil público: GIF de conta comum
  // aparece parado aqui também.
  const banner = resolveProfileMedia(
    profile.banner_url ?? null,
    tier,
    profile.vip_expires_at ?? null
  )
  const adjustments = coerceMediaAdjustments(profile.media_adjustments)

  const publicProfileHref = profile.display_slug
    ? profilePath(profile.display_slug)
    : profile.id
      ? `/perfil/${profile.id}`
      : null

  return (
    <header className="relative overflow-hidden border-b border-border/60">
      {/* Capa de fundo. `aria-hidden` porque é decoração: o conteúdo real do
          header é o nome e os selos, que ficam por cima. */}
      <div className="absolute inset-0" aria-hidden>
        {banner.src ? (
          <Image
            src={banner.src}
            alt=""
            fill
            unoptimized={banner.animated}
            sizes="100vw"
            style={mediaAdjustStyle(adjustments.banner)}
            className="object-cover"
            priority
          />
        ) : (
          <div
            className="size-full"
            style={{
              backgroundImage: `linear-gradient(120deg, hsl(${accentHue} 60% 40% / 0.5), hsl(${(accentHue + 50) % 360} 55% 25% / 0.35))`,
            }}
          />
        )}
        {/* Véu forte o bastante para o texto passar em qualquer capa — inclusive
            uma foto clara — sem apagar a imagem por completo. */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
      </div>

      <div className={cn("relative mx-auto flex flex-wrap items-center gap-4 px-4 py-8 md:px-6", width)}>
        <ProfileAvatar name={name} avatarUrl={profile.avatar_url} size="lg" frame={frame} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {name}
            </h1>
            <span className="shrink-0 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              {tierLabel}
            </span>
            {specialTag && (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${specialTag.className}`}
              >
                {specialTag.label}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{profile.email ?? "-"}</p>
        </div>

        {publicProfileHref && (
          <Link
            href={publicProfileHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            Ver perfil público
          </Link>
        )}
      </div>
    </header>
  )
}
