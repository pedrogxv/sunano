import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"

import { ProfileShowcase } from "@/components/profile/ProfileShowcase"
import { profilePath } from "@/lib/profile-name"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import {
  findUserIdByDisplaySlug,
  incrementProfileViews,
  isFollowing,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { SITE_URL } from "@/lib/site-url"

// Server Component: chama o repositório direto (ARQUITETURA.md §1), sem
// spinner client-side. Renderiza por requisição porque lê a sessão para
// decidir se exibe os atalhos de edição do dono.
export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O segmento é o slug do nome (`/perfil/joao-silva`), mas UUID continua
 * resolvendo: links antigos foram compartilhados antes do nome único existir.
 */
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
  if (!profile) return { title: "Perfil não encontrado" }

  const title = `${profile.display_name} — Perfil`
  const description = profile.bio ?? `Setup e periféricos favoritos de ${profile.display_name}.`
  const canonical = profile.display_slug ? profilePath(profile.display_slug) : undefined
  const image = profile.avatar_url ?? profile.banner_url

  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonical ? `${SITE_URL}${canonical}` : undefined,
      images: image ? [{ url: image, width: 512, height: 512 }] : undefined,
    },
    twitter: {
      card: image ? "summary" : "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const userId = await resolveUserId(handle)
  if (!userId) notFound()

  const profile = await getProfileShowcase(userId)
  if (!profile) notFound()

  // Uma URL por perfil: quem chegou pelo UUID (ou por um slug antigo, depois
  // de o dono trocar de nome) é levado para o endereço atual.
  if (profile.display_slug && decodeURIComponent(handle) !== profile.display_slug) {
    redirect(profilePath(profile.display_slug))
  }

  // A sessão é lida só para decidir se mostramos os atalhos de edição —
  // o conteúdo da página é público e igual para todos.
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const isOwner = authData.user?.id === profile.id

  // Não conta visita do próprio dono revisitando o próprio perfil.
  if (!isOwner) void incrementProfileViews(profile.id)

  const viewerId = authData.user?.id
  const following =
    viewerId && !isOwner ? await isFollowing(viewerId, profile.id) : false

  return <ProfileShowcase profile={profile} isOwner={isOwner} isFollowing={following} />
}
