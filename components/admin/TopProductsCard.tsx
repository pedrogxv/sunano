"use client"

import { useState } from "react"
import { Trophy } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatBRL } from "@/lib/format"
import type { TopProductsSeries } from "@/lib/server/repositories/dashboard-revenue-repository"
import { useT } from "@/lib/use-t"

type RangeKey = "today" | "week"

function TopProductsCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 flex-1 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

/**
 * Ranking dos top 5 produtos mais vendidos do dashboard admin — toggle
 * Hoje/Semana (mesmo do `PerformanceCard`). Só renderizado pra webmaster
 * (dado financeiro) — gate feito em app/admin/page.tsx, não aqui.
 */
export function TopProductsCard({ data, loading }: { data: TopProductsSeries | null; loading: boolean }) {
  const t = useT()
  const d = t.admin.dashboard
  const [range, setRange] = useState<RangeKey>("today")

  if (loading || !data) return <TopProductsCardSkeleton />

  const list = data[range]

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex h-full flex-col rounded-2xl border border-border bg-card p-4 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
            <Trophy className="size-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{d.topProductsCardTitle}</h3>
        </div>
        <Tabs value={range} onValueChange={(value) => setRange(value as RangeKey)}>
          <TabsList>
            <TabsTrigger value="today" className="px-2.5 text-xs">
              {d.performanceTabToday}
            </TabsTrigger>
            <TabsTrigger value="week" className="px-2.5 text-xs">
              {d.performanceTabWeek}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {list.length === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-8 text-center">
          <Trophy className="size-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">{d.topProductsEmpty}</p>
        </div>
      ) : (
        <div className="mt-4 flex-1 space-y-1">
          {list.map((product, index) => (
            <div key={product.productId} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground">{d.topProductsUnitsLabel(product.unitsSold)}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-foreground">{formatBRL(product.revenueCents)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
