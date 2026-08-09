import type { Metadata } from "next"

import {
  getFollowedIdsAmong,
  getTopAuraProfiles,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { PessoasContent } from "./pessoas-content"

export const metadata: Metadata = {
  // O `title.template` do layout raiz já acrescenta "| Sunano".
  title: "Pessoas",
  description: "Encontre outros membros, veja quem tem mais Aura e siga quem você curte.",
  alternates: { canonical: "/pessoas" },
}

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
