"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { RouteLink } from "@/components/ui/route-link"
import { ExternalLink, PencilLine } from "lucide-react"

import type { ProfileData } from "./ProfileSection"
import { AccountStatsStrip } from "./AccountStatsStrip"
import { TrustSealButton } from "@/components/ui/TrustSealButton"
import { daysOnSunano, type AccountSummary } from "@/lib/account-summary"
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
  /**
   * Ação do canto direito no lugar do "Ver perfil público". Para a página
   * cujo assunto não é o perfil (Meus Pedidos põe ali o guia da compra).
   */
  action,
  /**
   * Retrato da conta (`useAccountSummary`). Ligado, o hero ganha o selo do
   * Trust ao lado do nome, a linha "Membro nº · desde" e a faixa de números.
   * Fica de fora nas subpáginas (pedidos, suporte), onde o assunto é outro.
   * `undefined` = desligado; `null` = ligado, mas não carregou.
   */
  summary,
  summaryLoading = false,
  /** Botão "Editar perfil" (leva a /perfil). Desligado no próprio editor. */
  showEditProfile = false,
}: {
  profile: ProfileData
  width?: string
  action?: ReactNode
  summary?: AccountSummary | null
  summaryLoading?: boolean
  showEditProfile?: boolean
}) {
  const showSummary = summary !== undefined
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

      <div className={cn("relative mx-auto px-4 py-8 md:px-6", width)}>
      <div className="flex flex-wrap items-center gap-4">
        <ProfileAvatar name={name} avatarUrl={profile.avatar_url} size="lg" frame={frame} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {name}
            </h1>
            <span className="shrink-0 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              {tierLabel}
            </span>
            {summary && (
              <TrustSealButton level={summary.trust.level} status={summary.trust.status} size="xs" />
            )}
            {specialTag && (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${specialTag.className}`}
              >
                {specialTag.label}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{profile.email ?? "-"}</p>
          {summary && <MemberLine summary={summary} />}
        </div>

        {action ?? (
          <div className="flex w-full items-center gap-2 *:flex-1 sm:w-auto sm:shrink-0 sm:*:flex-none">
            {/* Atalho para o editor: /conta é o hub da conta, mas foto, banner,
                bio e moldura moram em /perfil — sem o botão a pessoa não
                achava por onde editar. Fora do próprio editor, claro. */}
            {showEditProfile && (
              <RouteLink
                href="/perfil"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90"
              >
                <PencilLine className="size-3.5" />
                Editar perfil
              </RouteLink>
            )}
            {publicProfileHref && (
              <RouteLink
                href={publicProfileHref}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
                Ver perfil público
              </RouteLink>
            )}
          </div>
        )}
      </div>

      {showSummary && (
        <div className="mt-6">
          <AccountStatsStrip
            summary={summary ?? null}
            loading={summaryLoading}
            publicProfileHref={publicProfileHref}
          />
        </div>
      )}
      </div>
    </header>
  )
}

/**
 * "Membro nº 1.234 · desde 12 set. 2026 · 42º dia" — o carimbo do
 * passaporte. Fundador entra como texto, não como coroa: a coroa já vem da
 * moldura do avatar (um sinal de VIP por avatar).
 */
function MemberLine({ summary }: { summary: AccountSummary }) {
  const since = new Date(summary.memberSince).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  const day = daysOnSunano(summary.memberSince)
  const parts = [
    summary.memberNumber ? `Membro nº ${summary.memberNumber.toLocaleString("pt-BR")}` : null,
    `na Sunano desde ${since}`,
    `${day.toLocaleString("pt-BR")}º dia`,
  ].filter(Boolean)

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/80">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap">
          {i > 0 && <span aria-hidden className="size-1 rounded-full bg-muted-foreground/40" />}
          {part}
        </span>
      ))}
      {summary.isFounder && (
        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          Fundador
        </span>
      )}
    </p>
  )
}
