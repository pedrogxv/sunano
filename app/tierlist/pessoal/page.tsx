import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
  // pública e indexável de cada membro é `/perfil/[handle]/tierlist`.
  robots: { index: false, follow: false },
}

export default function TierlistPessoalPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/tierlist"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Tierlist oficial
      </Link>
      <PersonalTierlistOwnerPanel />
    </div>
  )
}
