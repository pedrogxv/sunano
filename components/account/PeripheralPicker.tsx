"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Loader2, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

interface PeripheralPickerProps {
  onSelect: (peripheral: ShowcasePeripheral) => void
  /** Restringe os resultados a estas categorias (filtro no cliente). */
  categories?: readonly string[]
  /** Ids já escolhidos, ocultados dos resultados. */
  excludeIds?: string[]
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

/**
 * Busca de periféricos com debounce, no mesmo padrão já usado no fórum
 * (`/api/peripherals?search=...`): 2 caracteres mínimos, 300ms de espera.
 *
 * O filtro por categoria é aplicado no cliente porque um slot pode aceitar
 * mais de uma (fone = headset + iem, mousepad = mousepad + glasspad) e o
 * endpoint só recebe uma categoria por vez.
 */
export function PeripheralPicker({
  onSelect,
  categories,
  excludeIds = [],
  placeholder = "Buscar periférico...",
  disabled = false,
  autoFocus = false,
}: PeripheralPickerProps) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<ShowcasePeripheral[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const term = search.trim()
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const currentRequest = ++requestId.current

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/peripherals?search=${encodeURIComponent(term)}&limit=24`,
          { cache: "no-store" }
        )
        const data = (await res.json().catch(() => null)) as
          | { peripherals?: ShowcasePeripheral[] }
          | null
        // Descarta respostas de buscas antigas que chegaram fora de ordem.
        if (currentRequest !== requestId.current) return
        setResults(data?.peripherals ?? [])
      } catch {
        if (currentRequest === requestId.current) setResults([])
      } finally {
        if (currentRequest === requestId.current) setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  const visible = results
    .filter((p) => !categories || categories.includes(p.category))
    .filter((p) => !excludeIds.includes(p.id))
    .slice(0, 8)

  const term = search.trim()

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="border-border bg-background pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground/60" />
        )}
      </div>

      {term.length >= 2 && !loading && visible.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground/60">
          Nenhum periférico encontrado para “{term}”.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
          {visible.map((peripheral) => (
            <li key={peripheral.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(peripheral)
                  setSearch("")
                  setResults([])
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                )}
              >
                <div className="relative size-9 shrink-0">
                  {peripheral.image_url ? (
                    <Image
                      src={peripheral.image_url}
                      alt={peripheral.name}
                      fill
                      sizes="36px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="size-full rounded bg-muted/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{peripheral.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{peripheral.brand}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
