import type { Metadata } from "next"

import { getTierlistMeta } from "@/lib/server/repositories/tierlist-meta-repository"
import { TierlistPageHeader } from "@/components/tierlist/TierlistPageHeader"
import { PersonalTierlistOwnerPanel } from "@/components/tierlist-pessoal/PersonalTierlistOwnerPanel"

/**
 * Aba "Minha Tierlist" da Tierlist — rota própria, e não `?visao=pessoal` em
 * `/tierlist`.
 *
 * O motivo é de cache: ler `searchParams` torna a página dinâmica, e
 * `/tierlist` deixaria de ser servida do ISR (`revalidate`), passando a
 * rodar `listAllPeripherals()` — o catálogo inteiro — em toda visita à
 * tierlist oficial, que é a página de mais tráfego do site. Separado assim,
 * a oficial continua cacheada e só esta, que é pessoal por definição, roda
 * por requisição.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Minha Tierlist",
  // Conteúdo varia por conta (é sempre a do próprio visitante) — a tierlist
  // pública e indexável de cada membro é `/perfil/[handle]/tierlist`. `follow`
  // fica ligado: o Google não indexa esta página, mas segue os links dela
  // (inclusive para a tierlist pública do membro).
  robots: { index: false },
}

export default async function TierlistPessoalPage() {
  const tierlistMeta = await getTierlistMeta()

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6 md:py-8">
      <TierlistPageHeader active="pessoal" latestUpdate={tierlistMeta} />
      <PersonalTierlistOwnerPanel />
    </div>
  )
}
