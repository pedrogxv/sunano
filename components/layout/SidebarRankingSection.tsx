"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, Trophy } from "lucide-react"

import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { cn } from "@/lib/utils"

type RankedItem = {
  id: string
  name: string
  ranking: number
}

const CATEGORIES = [
  { key: "keyboard", label: "Teclados" },
  { key: "mouse", label: "Mouse" },
  { key: "mousepad", label: "Pad" },
]

export function SidebarRankingSection({ isCollapsed }: { isCollapsed: boolean }) {
  const [category, setCategory] = useState("keyboard")
  const [items, setItems] = useState<RankedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setItems([])
    fetch(`/api/peripherals?full=1&category=${category}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        const ranked: RankedItem[] = (data.peripherals ?? [])
          .map((p: { id: string; name: string; specs?: { details?: { ranking?: unknown } } }) => {
            const raw = p.specs?.details?.ranking
            const ranking = raw != null ? Number(raw) : null
            return { id: p.id, name: p.name, ranking }
          })
          .filter((p: RankedItem & { ranking: number | null }) => typeof p.ranking === "number" && p.ranking > 0)
          .sort((a: RankedItem, b: RankedItem) => a.ranking - b.ranking)
          .slice(0, 15)
        setItems(ranked)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [category])

  if (isCollapsed) {
    return (
      <div className="my-2 flex justify-center py-1.5">
        <Trophy className="size-[18px] shrink-0 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mt-4">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        Ranking
      </p>

      {/* Category tabs */}
      <div className="mb-1.5 flex gap-1 px-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-semibold transition-colors",
              category === cat.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {loading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Sem ranking disponível</p>
        ) : (
          items.map((item) => {
            const href = item.id
              ? `/perifericos/${buildPeripheralSlug(item.name, item.id)}`
              : null

            if (!href) {
              return (
                <div
                  key={item.id || item.name}
                  className="flex cursor-default items-center gap-2 rounded-lg px-3 py-1.5"
                >
                  <span className="w-5 shrink-0 text-center text-[10px] font-bold text-muted-foreground/50">
                    #{item.ranking}
                  </span>
                  <span className="flex-1 truncate text-xs text-muted-foreground/50 italic">
                    Review ainda não disponível
                  </span>
                </div>
              )
            }

            return (
              <Link
                key={item.id}
                href={href}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
              >
                <span className="w-5 shrink-0 text-center text-[10px] font-bold text-foreground/50">
                  #{item.ranking}
                </span>
                <span className="flex-1 truncate">{item.name}</span>
              </Link>
            )
          })
        )}
      </div>

      {/* Ver todos */}
      {!loading && (
        <Link
          href="/ranking"
          className="mt-0.5 flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground/60 transition-all hover:text-muted-foreground"
        >
          <ChevronRight className="size-3 shrink-0" />
          Ver todos
        </Link>
      )}
    </div>
  )
}
