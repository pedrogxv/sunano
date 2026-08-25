import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"

import { ProfileShowcase } from "@/components/profile/ProfileShowcase"
import { profilePath } from "@/lib/profile-name"
import { resolveProfileUserId } from "@/lib/server/profile-handle"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import { incrementProfileViews, isFollowing } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

// Server Component: chama o repositório direto (ARQUITETURA.md §1), sem
// spinner client-side. Renderiza por requisição porque lê a sessão para
// decidir se exibe os atalhos de edição do dono.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const userId = await resolveProfileUserId(handle)
  const profile = userId ? await getProfileShowcase(userId) : null
  if (!profile) return { title: "Perfil não encontrado" }

  const canonicalPath = profile.display_slug ? profilePath(profile.display_slug) : null
  const ogTitle = profile.display_name
  const ogDescription = `Perfil de ${profile.display_name} no Sunano.`
  // Preview de compartilhamento (WhatsApp/Discord/Telegram/X): imagem gerada
  // em `opengraph-image/route.tsx`, sempre uma URL direta e estável por
  // perfil — sem redirecionamento, que o WhatsApp não segue. Título e
  // descrição do embed são propositalmente mais curtos que os da aba/SEO
  // (`title`/`description` acima), que continuam levando a bio do usuário.
  const ogImage = canonicalPath
    ? { url: `${canonicalPath}/opengraph-image`, width: 1200, height: 630, alt: ogDescription }
    : { url: "/icon.png", width: 512, height: 512 }

  return {
    title: `${profile.display_name} — Perfil`,
    description: profile.bio ?? `Setup e periféricos favoritos de ${profile.display_name}.`,
    alternates: canonicalPath ? { canonical: canonicalPath } : undefined,
    openGraph: {
      type: "website",
      siteName: "Sunano",
      locale: "pt_BR",
      title: ogTitle,
      description: ogDescription,
      url: canonicalPath ?? undefined,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImage.url],
    },
  }
}

export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const userId = await resolveProfileUserId(handle)
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
