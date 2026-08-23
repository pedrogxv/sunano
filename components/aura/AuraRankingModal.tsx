"use client"

import { useEffect, useState } from "react"
import { Crown, Flame, Loader2, Trophy } from "lucide-react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { profileAccentHue } from "@/lib/user-directory"
import { profilePath } from "@/lib/profile-name"

type RankingWindow = "all" | "today" | "week"

type RankingEntry = {
  userId: string
  displayName: string
  displaySlug: string
  avatarUrl: string | null
  isVip: boolean
  value: number
}

const WINDOW_TABS: Array<{ key: RankingWindow; label: string; empty: string }> = [
  { key: "all", label: "Tudo", empty: "Ninguém tem Aura ainda — seja o primeiro." },
  { key: "today", label: "Hoje", empty: "Ninguém ganhou Aura hoje ainda." },
  { key: "week", label: "Semana", empty: "Ninguém ganhou Aura nesta semana ainda." },
]

const MEDAL_STYLES = [
  { bg: "bg-amber-400/15", text: "text-amber-300", ring: "ring-amber-400/40" },
  { bg: "bg-slate-300/15", text: "text-slate-200", ring: "ring-slate-300/40" },
  { bg: "bg-amber-700/15", text: "text-amber-600", ring: "ring-amber-700/40" },
]

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  )
}

interface AuraRankingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Modal "Ranking" da Central de Aura: Top 10 por saldo total ("Tudo", mesma
 * fonte de `/pessoas` aba Mais Aura) e Top 10 por Aura ganha nas últimas 24h
 * ("Hoje") / 7 dias ("Semana") — essas duas vêm de uma agregação cacheada no
 * servidor (ver `getAuraRanking`), então trocar de aba não pesa o banco a
 * cada clique.
 */
export function AuraRankingModal({ open, onOpenChange }: AuraRankingModalProps) {
  const [active, setActive] = useState<RankingWindow>("all")
  const [cache, setCache] = useState<Partial<Record<RankingWindow, RankingEntry[]>>>({})

  useEffect(() => {
    if (!open) return
    if (cache[active] !== undefined) return

    let cancelled = false
    fetch(`/api/aura/ranking?window=${active}`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: RankingEntry[] }) => {
        if (cancelled) return
        setCache((prev) => ({ ...prev, [active]: data.entries ?? [] }))
      })
      .catch(() => {
        if (!cancelled) setCache((prev) => ({ ...prev, [active]: [] }))
      })
    return () => {
      cancelled = true
    }
  }, [open, active, cache])

  // Reseta o cache só ao fechar, disparado pelo próprio evento de fechamento
  // (não por um effect observando `open`) — evita mostrar dado de minutos
  // atrás numa reabertura bem mais tarde na mesma sessão.
  function handleOpenChange(next: boolean) {
    if (!next) setCache({})
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-orange-500/10">
            <Trophy className="size-7 text-orange-400" strokeWidth={1.5} />
          </div>
          <DialogTitle className="text-center text-xl">Ranking de Aura</DialogTitle>
          <DialogDescription className="text-center">
            Os 10 usuários com mais Aura — no geral e por período.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={active} onValueChange={(v) => setActive(v as RankingWindow)}>
          <TabsList className="mx-auto h-10 p-1">
            {WINDOW_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="px-4 py-1.5 text-base">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {WINDOW_TABS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="pt-3">
              <RankingList entries={cache[tab.key]} emptyMessage={tab.empty} showsGained={tab.key !== "all"} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function RankingList({
  entries,
  emptyMessage,
  showsGained,
}: {
  entries: RankingEntry[] | undefined
  emptyMessage: string
  showsGained: boolean
}) {
  if (entries === undefined) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <ol className="space-y-1.5">
      {entries.map((entry, index) => {
        const place = index + 1
        const medal = MEDAL_STYLES[index]
        const hue = profileAccentHue(entry.userId)
        return (
          <li key={entry.userId}>
            <a
              href={profilePath(entry.displaySlug)}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-muted/40",
                place <= 3 && "bg-muted/20"
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  medal ? cn(medal.bg, medal.text) : "bg-muted text-muted-foreground"
                )}
              >
                {place}
              </span>

              <div
                className={cn(
                  "relative size-8 shrink-0 overflow-hidden rounded-full bg-muted",
                  medal && `ring-2 ${medal.ring}`
                )}
              >
                <ImageWithFallback
                  src={entry.avatarUrl}
                  alt={entry.displayName}
                  fill
                  sizes="32px"
                  className="object-cover"
                  fallback={
                    <div
                      className="flex size-full items-center justify-center text-[10px] font-bold text-white/90"
                      style={{
                        backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 45) % 360} 50% 28%))`,
                      }}
                    >
                      {initialsOf(entry.displayName)}
                    </div>
                  }
                />
              </div>

              <span className="flex-1 truncate text-sm font-semibold text-foreground">
                {entry.displayName}
                {entry.isVip && (
                  <Crown className="ml-1 inline-block size-3 -translate-y-px" style={{ color: "var(--vip-accent)" }} />
                )}
              </span>

              <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-orange-400 tabular-nums">
                <Flame className="size-3.5" fill="currentColor" strokeWidth={0} />
                {entry.value.toLocaleString("pt-BR")}
                {showsGained && <span className="text-[10px] font-medium text-muted-foreground">ganhos</span>}
              </span>
            </a>
          </li>
        )
      })}
    </ol>
  )
}
