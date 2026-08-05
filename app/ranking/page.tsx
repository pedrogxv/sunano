import type { Metadata } from "next"

import { getRankedPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { RankingContent } from "./ranking-content"

export const revalidate = 30

export const metadata: Metadata = {
  title: "Ranking",
  description: "Ranking de periféricos gamers por pontuação de Performance e Estabilidade.",
  alternates: { canonical: "/ranking" },
}

export default async function RankingPage() {
  const peripherals = await getRankedPeripherals()

  return <RankingContent peripherals={peripherals} />
}
