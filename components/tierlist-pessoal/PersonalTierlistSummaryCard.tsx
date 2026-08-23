import Link from "next/link"
import { Crown, Trophy } from "lucide-react"

interface PersonalTierlistSummaryCardProps {
  itemCount: number
  tierlistHref: string
}

/** Card resumido "Tierlist pessoal (Beta)" no perfil público — só aparece quando há pelo menos 1 item. */
export function PersonalTierlistSummaryCard({ itemCount, tierlistHref }: PersonalTierlistSummaryCardProps) {
  if (itemCount === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tierlist pessoal (Beta)</h2>
      <Link
        href={tierlistHref}
        className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-[var(--vip-accent)]/40 hover:bg-card"
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: "var(--vip-accent)" }}
        >
          <Trophy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Crown className="size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />
            Confira o ranking pessoal
          </p>
          <p className="text-xs text-muted-foreground">{itemCount} {itemCount === 1 ? "item classificado" : "itens classificados"}</p>
        </div>
      </Link>
    </section>
  )
}
