import Link from "next/link"

interface RankingCrownBadgeProps {
  position: number
}

export function RankingCrownBadge({ position }: RankingCrownBadgeProps) {
  return (
    <Link
      href="/ranking"
      className="group inline-flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:-translate-y-0.5"
    >
      <div className="-rotate-2 leading-none transition group-hover:rotate-0">
        <p className="font-handwritten text-2xl font-semibold tracking-wide text-amber-400/80 md:text-3xl">
          Ranking
        </p>
        <p className="font-handwritten -mt-3 text-7xl font-bold text-amber-400 md:text-9xl">
          #{position}
        </p>
      </div>
    </Link>
  )
}
