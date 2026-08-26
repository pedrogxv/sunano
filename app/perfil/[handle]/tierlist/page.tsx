import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { profilePath } from "@/lib/profile-name"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import { getUserTierlistItems } from "@/lib/server/repositories/user-tierlist-repository"
import { findUserIdByDisplaySlug } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isVipActive } from "@/lib/account-tier"
import { PersonalTierlistPublicView } from "@/components/tierlist-pessoal/PersonalTierlistPublicView"
import { PersonalTierlistEditor } from "@/components/tierlist-pessoal/PersonalTierlistEditor"

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
    description: `A tierlist pessoal de ${profile.display_name} na Sunano: como esse membro classifica os periféricos que já usou, do S ao F.`,
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

  const items = await getUserTierlistItems(userId)
  const ownerIsVip = isOwner && isVipActive(profile.account_tier, profile.vip_expires_at)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href={profilePath(profile.display_slug ?? profile.id)} className="relative size-10 shrink-0 overflow-hidden rounded-full border border-border">
          {profile.avatar_url ? (
            <Image src={profile.avatar_url} alt={profile.display_name} fill sizes="40px" className="object-cover" />
          ) : (
            <div className="size-full bg-muted/40" />
          )}
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">Tierlist de {profile.display_name}</h1>
          <Link
            href={profilePath(profile.display_slug ?? profile.id)}
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            ← Voltar ao perfil
          </Link>
        </div>
      </div>

      {isOwner && (
        <p className="mb-4 text-xs text-muted-foreground">
          Recurso exclusivo VIP (Beta). {!ownerIsVip && "Sua tierlist fica visível, mas só é possível editar com VIP ativo."}
        </p>
      )}

      {isOwner && ownerIsVip ? (
        <PersonalTierlistEditor initialItems={items} />
      ) : (
        <PersonalTierlistPublicView items={items} />
      )}
    </div>
  )
}
