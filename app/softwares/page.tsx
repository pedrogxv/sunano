import type { Metadata } from "next"

import { SoftwaresContent } from "@/components/softwares/SoftwaresContent"
import { getSoftwaresPageData } from "@/lib/server/repositories/softwares-repository"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Softwares",
  socialTitle: "Softwares: web hubs das marcas de periféricos",
  description:
    "Todos os WebSoftwares das marcas de periféricos em um só lugar. Configure mouse, teclado e headset direto no navegador.",
  path: "/softwares",
  eyebrow: "Periféricos",
  subtitle: "Todos os WebSoftwares em um só lugar",
})

// Lista e "Mais usados" são iguais para todo visitante (cache no repositório,
// invalidado quando o admin salva). Favoritos saem do cliente, então a página
// continua servida do CDN.
export const revalidate = 300

export default async function SoftwaresPage() {
  const { softwares, mostUsedIds } = await getSoftwaresPageData()
  return <SoftwaresContent softwares={softwares} mostUsedIds={mostUsedIds} />
}
