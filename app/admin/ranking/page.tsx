import { getRankedPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { RankingContent } from "@/app/ranking/ranking-content"

export const revalidate = 30

export default async function AdminRankingPage() {
  const peripherals = await getRankedPeripherals()

  return <RankingContent peripherals={peripherals} />
}
