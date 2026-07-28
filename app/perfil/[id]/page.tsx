import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { ProfileShowcase } from "@/components/profile/ProfileShowcase"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

// Server Component: chama o repositório direto (ARQUITETURA.md §1), sem
// spinner client-side. Renderiza por requisição porque lê a sessão para
// decidir se exibe os atalhos de edição do dono.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const profile = await getProfileShowcase(id)
  if (!profile) return { title: "Perfil não encontrado" }

  return {
    title: `${profile.display_name} — Perfil`,
    description: profile.bio ?? `Setup e periféricos favoritos de ${profile.display_name}.`,
  }
}

export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getProfileShowcase(id)

  if (!profile) notFound()

  // A sessão é lida só para decidir se mostramos os atalhos de edição —
  // o conteúdo da página é público e igual para todos.
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const isOwner = authData.user?.id === profile.id

  return <ProfileShowcase profile={profile} isOwner={isOwner} />
}
