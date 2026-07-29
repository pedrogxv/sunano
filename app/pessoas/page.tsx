import type { Metadata } from "next"

import {
  getFollowedIdsAmong,
  getMostVisitedProfiles,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { PessoasContent } from "./pessoas-content"

export const metadata: Metadata = {
  title: "Pessoas — Sunano Tierlist",
  description: "Encontre outros membros, veja os mais visitados e siga quem você curte.",
}

// Lê a sessão para marcar quem o visitante já segue e esconder o botão no
// próprio card, então renderiza por requisição.
export const dynamic = "force-dynamic"

export default async function PessoasPage() {
  const profiles = await getMostVisitedProfiles(48)

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
