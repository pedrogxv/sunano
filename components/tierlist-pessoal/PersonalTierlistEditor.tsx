"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Search, X, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TierlistItem, TierlistTier } from "@/lib/server/repositories/user-tierlist-repository"

const TIERS: TierlistTier[] = ["S", "A", "B", "C", "D"]

type SearchResult = {
  id: string
  name: string
  image_url: string | null
  brand?: string | null
}

/** Editor client-side da tierlist pessoal — busca periférico, escolhe tier, salva via /api/perfil/tierlist. Só renderizado para o dono VIP. */
export function PersonalTierlistEditor({ initialItems }: { initialItems: TierlistItem[] }) {
  const [items, setItems] = useState<TierlistItem[]>(initialItems)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      fetch(`/api/peripherals?search=${encodeURIComponent(trimmed)}&limit=8`)
        .then((res) => res.json())
        .then((json: { peripherals?: SearchResult[] }) => {
          if (!cancelled) setResults(json.peripherals ?? [])
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const existingIds = new Set(items.map((i) => i.peripheralId))

  async function addItem(peripheral: SearchResult, tier: TierlistTier) {
    setSavingId(peripheral.id)
    const position = items.filter((i) => i.tier === tier).length
    try {
      const res = await fetch("/api/perfil/tierlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peripheralId: peripheral.id, tier, position }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar item")

      setItems((prev) => [
        ...prev,
        {
          peripheralId: peripheral.id,
          tier,
          position,
          peripheral: {
            id: peripheral.id,
            name: peripheral.name,
            brandName: peripheral.brand ?? null,
            category: "",
            imageUrl: peripheral.image_url,
          },
        },
      ])
      setQuery("")
      setResults([])
      toast.success(`${peripheral.name} adicionado no tier ${tier}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar item")
    } finally {
      setSavingId(null)
    }
  }

  async function changeTier(peripheralId: string, tier: TierlistTier) {
    const item = items.find((i) => i.peripheralId === peripheralId)
    if (!item) return
    setSavingId(peripheralId)
    try {
      const position = items.filter((i) => i.tier === tier).length
      const res = await fetch("/api/perfil/tierlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peripheralId, tier, position }),
      })
      if (!res.ok) throw new Error("Erro ao mover item")
      setItems((prev) => prev.map((i) => (i.peripheralId === peripheralId ? { ...i, tier, position } : i)))
    } catch {
      toast.error("Erro ao mover item")
    } finally {
      setSavingId(null)
    }
  }

  async function removeItem(peripheralId: string) {
    setSavingId(peripheralId)
    try {
      const res = await fetch("/api/perfil/tierlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peripheralId }),
      })
      if (!res.ok) throw new Error("Erro ao remover item")
      setItems((prev) => prev.filter((i) => i.peripheralId !== peripheralId))
    } catch {
      toast.error("Erro ao remover item")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar periférico para adicionar..."
          className="pl-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {query.trim().length >= 2 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-secondary/30">
          {searching ? (
            <p className="p-3 text-xs text-muted-foreground">Buscando...</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhum periférico encontrado.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-2">
                  <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-[var(--card-image-bg)]">
                    {p.image_url && <Image src={p.image_url} alt={p.name} fill sizes="36px" className="object-contain p-0.5" />}
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</p>
                  {existingIds.has(p.id) ? (
                    <span className="text-xs text-muted-foreground">já adicionado</span>
                  ) : (
                    <div className="flex gap-1">
                      {TIERS.map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          disabled={savingId === p.id}
                          onClick={() => addItem(p, tier)}
                          className="flex size-6 items-center justify-center rounded text-[11px] font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                          style={{ backgroundColor: "var(--vip-accent)" }}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2">
        {TIERS.map((tier) => {
          const tierItems = items.filter((i) => i.tier === tier)
          if (tierItems.length === 0) return null
          return (
            <div key={tier} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 p-2">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                style={{ backgroundColor: "var(--vip-accent)" }}
              >
                {tier}
              </span>
              {tierItems.map((item) => (
                <div
                  key={item.peripheralId}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 py-1 pl-1.5 pr-1",
                    savingId === item.peripheralId && "opacity-50"
                  )}
                >
                  <div className="relative size-7 shrink-0 overflow-hidden rounded bg-[var(--card-image-bg)]">
                    {item.peripheral.imageUrl && (
                      <Image src={item.peripheral.imageUrl} alt={item.peripheral.name} fill sizes="28px" className="object-contain" />
                    )}
                  </div>
                  <span className="max-w-32 truncate text-xs text-foreground">{item.peripheral.name}</span>
                  <Select value={item.tier} onValueChange={(v) => changeTier(item.peripheralId, v as TierlistTier)}>
                    <SelectTrigger className="h-6 w-14 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => removeItem(item.peripheralId)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Busque um periférico acima para começar sua tierlist.</p>
        )}
      </div>
    </div>
  )
}
