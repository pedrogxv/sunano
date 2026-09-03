import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { getTopAuraProfiles } from "@/lib/server/repositories/users-repository"
import { PessoasContent } from "./pessoas-content"

export const metadata: Metadata = buildMetadata({
  title: "Pessoas",
  socialTitle: "Pessoas: membros da comunidade",
  description:
    "Encontre outros membros da comunidade, veja quem tem mais Aura, siga quem você curte e compare setups.",
  path: "/pessoas",
  eyebrow: "Comunidade",
  subtitle: "Membros, Aura e setups",
})

// A página é servida do CDN: o ranking inicial ("Mais Aura") sai de
// `unstable_cache` (5 min) no repositório e é igual para todo visitante. Quem
// está logado e quem o visitante já segue é resolvido no cliente (`useAuthUser`
// + um fetch leve a `/api/users/follows/among`), então nada aqui depende da
// sessão e a rota pode revalidar de tempos em tempos em vez de por requisição.
export const revalidate = 300

export default async function PessoasPage() {
  const profiles = await getTopAuraProfiles(100)
  return <PessoasContent initialProfiles={profiles} />
}
