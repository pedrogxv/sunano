import type { Metadata } from "next"
import { Handshake } from "lucide-react"

import { ComingSoon } from "@/components/store/ComingSoon"
import { isAffiliatesBlockedByMaintenance } from "@/lib/server/auth/affiliate-access"
import { getStoreLaunchAt } from "@/lib/store-maintenance"
import { buildMetadata } from "@/lib/seo"

// Vale para a área inteira (painel, extrato, saques, solicitação): conteúdo
// por conta, nada indexável. O robots.txt só impede o rastreio — sem
// `noIndex` uma URL linkada de fora ainda entra no índice.
export const metadata: Metadata = buildMetadata({
  title: "Programa de afiliados",
  description: "Painel do programa de afiliados da Sunano.",
  path: "/afiliados",
  noIndex: true,
})

// Guarda de servidor para TODA a área de afiliados (painel, solicitação,
// extrato e saques) — as páginas internas são client components e não podem
// checar isso sozinhas. O proxy já bloqueia antes (proxy.ts), mas este layout
// é a rede de baixo: se o matcher do proxy mudar, a área continua fechada.
export default async function AfiliadosLayout({ children }: { children: React.ReactNode }) {
  if (await isAffiliatesBlockedByMaintenance()) {
    return (
      <ComingSoon
        icon={Handshake}
        title="Programa de Afiliados"
        description="O Programa de Afiliados abre junto com a Loja. Fique de olho nas redes para o lançamento."
        accent="emerald"
        launchAt={getStoreLaunchAt()}
      />
    )
  }

  return <>{children}</>
}
