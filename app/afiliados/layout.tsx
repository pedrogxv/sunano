import { Handshake } from "lucide-react"

import { ComingSoon } from "@/components/store/ComingSoon"
import { isAffiliatesBlockedByMaintenance } from "@/lib/server/auth/affiliate-access"
import { getStoreLaunchAt } from "@/lib/store-maintenance"

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
