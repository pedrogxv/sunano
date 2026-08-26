import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import {
  getFollowedIdsAmong,
  getTopAuraProfiles,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { PessoasContent } from "./pessoas-content"

export const metadata: Metadata = buildMetadata({
  title: "Pessoas",
  socialTitle: "Pessoas: membros da comunidade",
  description: "Encontre outros membros da comunidade, veja quem tem mais Aura, siga quem você curte e compare setups.",
  path: "/pessoas",
  eyebrow: "Comunidade",
  subtitle: "Membros, Aura e setups",
})

// Lê a sessão para marcar quem o visitante já segue e esconder o botão no
// próprio card, então renderiza por requisição.
export const dynamic = "force-dynamic"

export default async function PessoasPage() {
  const profiles = await getTopAuraProfiles(100)

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const currentUserId = authData.user?.id ?? null

  const followedIds = currentUserId
    ? await getFollowedIdsAmong(currentUserId, profiles.map((p) => p.id))
    : []

  return (
    <PessoasContent
      initialProfiles={profiles}
      followedIds={followedIds}
      currentUserId={currentUserId}
    />
  )
}
