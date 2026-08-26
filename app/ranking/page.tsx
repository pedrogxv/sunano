import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { getRankedPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { RankingContent } from "./ranking-content"

export const revalidate = 120

export const metadata: Metadata = buildMetadata({
  title: "Ranking",
  socialTitle: "Ranking de periféricos por nota",
  description: "Ranking de periféricos gamers por pontuação de Performance e Estabilidade, calculado a partir das reviews da comunidade.",
  path: "/ranking",
  eyebrow: "Ranking",
  subtitle: "Performance e Estabilidade",
})

export default async function RankingPage() {
  const peripherals = await getRankedPeripherals()

  return <RankingContent peripherals={peripherals} />
}
