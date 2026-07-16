import Link from "next/link"

interface RankingCrownBadgeProps {
  position: number
}

/**
 * Sketchy hand-drawn crown, redrawn twice with a slight offset so it reads
 * like a doodle instead of a clean vector icon.
 */
function DoodleCrown({ className }: { className?: string }) {
  const crownPath = "M9 55 L23 15 L37 34 L50 7 L64 35 L78 16 L92 55"
  const bandPath = "M7 55 Q50 64 94 55"

  return (
    <svg
      viewBox="0 0 100 70"
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g stroke="currentColor" strokeOpacity="0.35" strokeWidth="4" transform="translate(2 -1.5) rotate(-2 50 35)">
        <path d={crownPath} />
        <path d={bandPath} />
      </g>
      <g stroke="currentColor" strokeWidth="4">
        <path d={crownPath} />
        <path d={bandPath} />
        <circle cx="23" cy="15" r="3.4" fill="currentColor" stroke="none" />
        <circle cx="50" cy="7" r="4" fill="currentColor" stroke="none" />
        <circle cx="78" cy="16" r="3.4" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

export function RankingCrownBadge({ position }: RankingCrownBadgeProps) {
  return (
    <Link
      href="/ranking"
      className="group inline-flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:-translate-y-0.5"
    >
      <DoodleCrown className="size-20 shrink-0 -rotate-6 text-amber-400 transition group-hover:-rotate-3 md:size-32" />
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
