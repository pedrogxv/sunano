import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft, Crown } from "lucide-react"
import { buildMetadata } from "@/lib/seo"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { absoluteUrl } from "@/lib/site-url"
import { PERSONAL_TIERS, PERSONAL_TIER_THEMES } from "@/lib/personal-tierlist-theme"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { profilePath } from "@/lib/profile-name"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import {
  getUserTierlistItems,
  getUserTierlistMeta,
} from "@/lib/server/repositories/user-tierlist-repository"
import { findUserIdByDisplaySlug } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isVipActive, resolveProfileMedia } from "@/lib/account-tier"
import { profileAccentHue } from "@/lib/user-directory"
import { mediaAdjustStyle } from "@/lib/profile-media-adjust"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { PersonalTierlistPublicView } from "@/components/tierlist-pessoal/PersonalTierlistPublicView"
import { PersonalTierlistEditor } from "@/components/tierlist-pessoal/PersonalTierlistEditor"
import { TierlistNoteCard } from "@/components/tierlist-pessoal/TierlistNoteCard"
import { TierlistVipGate } from "@/components/tierlist-pessoal/TierlistVipGate"
import {
  TierlistHeartButton,
  TierlistHeartCount,
} from "@/components/tierlist-pessoal/TierlistHeartButton"

export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveUserId(handle: string): Promise<string | null> {
  const value = decodeURIComponent(handle)
  if (UUID_PATTERN.test(value)) return value
  return findUserIdByDisplaySlug(value)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const userId = await resolveUserId(handle)
  const profile = userId ? await getProfileShowcase(userId) : null
  if (!profile) return { title: "Tierlist não encontrada" }

  const canonical = profile.display_slug
    ? `${profilePath(profile.display_slug)}/tierlist`
    : `/perfil/${handle}/tierlist`

  return buildMetadata({
    title: `Tierlist de ${profile.display_name}`,
    description: `A tierlist pessoal de ${profile.display_name} na Sunano: como esse membro classifica os periféricos que já usou, do S ao D.`,
    path: canonical,
    eyebrow: "Tierlist",
    subtitle: "Tierlist pessoal do membro",
    image: profile.avatar_url,
    imageVariant: "avatar",
  })
}

export default async function PerfilTierlistPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const userId = await resolveUserId(handle)
  if (!userId) notFound()

  const profile = await getProfileShowcase(userId)
  if (!profile) notFound()

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const isOwner = authData.user?.id === profile.id

  const viewerId = authData.user?.id ?? null
  const [items, meta] = await Promise.all([
    getUserTierlistItems(userId),
    getUserTierlistMeta(userId, viewerId),
  ])
  const ownerIsVip = isOwner && isVipActive(profile.account_tier, profile.vip_expires_at)
  // Coração é de terceiro: o dono e quem não está logado veem só o número.
  const canHeart = Boolean(viewerId) && !isOwner

  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier)
  const accentHue = profileAccentHue(profile.id)
  const initials =
    profile.display_name.trim().split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2) ||
    "?"

  const profileHref = profilePath(profile.display_slug ?? profile.id)
  // Mesmo caminho do canonical em `generateMetadata` — compartilhar sempre leva
  // ao endereço oficial da tierlist, não ao UUID pelo qual a pessoa chegou.
  const canonicalPath = `${profileHref}/tierlist`
  const tiersUsed = PERSONAL_TIERS.filter((tier) => items.some((item) => item.tier === tier))

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <Link
        href={profileHref}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao perfil
      </Link>

      {/* Header no espírito do board oficial: faixa de gradiente dos tiers como
          assinatura visual, avatar e contagem — em vez de uma linha de texto. */}
      <header className={cn("relative mb-6 overflow-hidden rounded-xl border p-5", CARD_SURFACE)}>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-1">
          {PERSONAL_TIERS.map((tier) => (
            <div key={tier} className={cn("flex-1 bg-gradient-to-r", PERSONAL_TIER_THEMES[tier].accent)} />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={profileHref}
            className="relative size-14 shrink-0 overflow-hidden rounded-full border-2"
            style={{ borderColor: "var(--vip-accent)" }}
          >
            {/* Mesmo avatar do resto do site: iniciais sobre o gradiente do
                perfil quando não há foto (antes ficava um círculo vazio), com
                `ImageWithFallback` para cobrir também a imagem que existe mas
                falha ao carregar. */}
            <ImageWithFallback
              src={avatar.src}
              alt={profile.display_name}
              fill
              unoptimized={avatar.animated}
              sizes="56px"
              style={mediaAdjustStyle(profile.media_adjustments.avatar)}
              className="object-cover"
              fallback={
                <div
                  className="flex size-full items-center justify-center text-lg font-bold text-white/90"
                  style={{
                    backgroundImage: `linear-gradient(135deg, hsl(${accentHue} 55% 40%), hsl(${(accentHue + 45) % 360} 50% 28%))`,
                  }}
                >
                  {initials}
                </div>
              }
            />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--vip-accent)" }}>
              <Crown className="size-3" />
              Tierlist pessoal · Beta
            </p>
            <h1 className="mt-0.5 truncate text-xl font-bold text-foreground">
              Tierlist de {profile.display_name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {items.length === 0
                ? "Nenhum periférico classificado ainda."
                : `${items.length} ${items.length === 1 ? "periférico" : "periféricos"} · ${tiersUsed.length} ${tiersUsed.length === 1 ? "tier" : "tiers"}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Coração: some quando não há nada classificado — não faz sentido
                aplaudir uma tierlist vazia, nem mostrar um contador zerado. */}
            {items.length > 0 &&
              (canHeart ? (
                <TierlistHeartButton
                  ownerId={profile.id}
                  initialHearted={meta.viewerHearted}
                  initialCount={meta.heartsCount}
                />
              ) : (
                <TierlistHeartCount count={meta.heartsCount} />
              ))}

            {/* Só faz sentido compartilhar uma tierlist que tem o que mostrar. */}
            {items.length > 0 && (
              <ShareMenu
                url={absoluteUrl(canonicalPath)}
                title={`Tierlist de ${profile.display_name} na Sunano`}
                showEmbed={false}
              />
            )}
          </div>
        </div>

      </header>

      {/* Dono sem VIP: o aviso substitui o editor, com dois tons — quem já
          tem tierlist precisa saber que ela não sumiu; quem não tem precisa
          saber o que a feature faz antes de assinar. */}
      {isOwner && !ownerIsVip && (
        <TierlistVipGate variant={items.length > 0 ? "expired" : "locked"} className="mb-4" />
      )}

      {/* Recado do dono acima do board: contexto antes do ranking, e é onde o
          dono escreve — a página da tierlist é o único lugar com o editor.
          O wrapper só existe quando há o que mostrar: `TierlistNoteCard`
          devolve `null` para visitante sem recado, e uma div vazia com `mb-4`
          deixaria um buraco entre o header e o board. */}
      {(meta.note || (isOwner && ownerIsVip)) && (
        <div className="mb-4">
          <TierlistNoteCard note={meta.note} canEdit={isOwner && ownerIsVip} />
        </div>
      )}

      {/* Board vazio de dono sem VIP fica de fora: o gate acima já disse o que
          está acontecendo, e "Ainda não há itens" logo abaixo só repetiria. */}
      {isOwner && ownerIsVip ? (
        <PersonalTierlistEditor initialItems={items} />
      ) : items.length > 0 || !isOwner ? (
        <PersonalTierlistPublicView items={items} />
      ) : null}
    </div>
  )
}
