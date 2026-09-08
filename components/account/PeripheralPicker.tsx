"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { CornerDownLeft, Loader2, PackageSearch, Search, Sparkles, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"
import { CATEGORY_PLURAL_LABELS, isCategory } from "@/lib/tag-options"
import { mapTier } from "@/lib/tier-utils"
import { TIER_THEMES } from "@/lib/tierlist-theme"
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

/** Quantos resultados a lista mostra de uma vez. */
const MAX_RESULTS = 8

/** Sugestões de marca quando o campo está vazio — atalho pra quem não sabe por onde começar. */
const BRAND_SUGGESTIONS = ["Logitech", "Razer", "Pulsar", "Wooting", "Keychron", "Lamzu"]

/**
 * Busca de periféricos com debounce (`/api/peripherals?search=...`): 2
 * caracteres mínimos, 300ms de espera.
 *
 * Além do campo, a lista traz o que faltava pra escolher sem sair da página:
 * marca e categoria por resultado, selo de tier do catálogo, trecho buscado
 * destacado no nome, navegação por teclado (↑/↓/Enter/Esc) e atalhos de marca
 * enquanto nada foi digitado. Sem isso o editor de perfil era um input solto
 * onde só o nome exato levava a algum lugar.
 *
 * O filtro por categoria é aplicado no cliente porque um slot pode aceitar
 * mais de uma (fone = headset + iem, mousepad = mousepad + glasspad) e o
 * endpoint só recebe uma categoria por vez.
 */
export function PeripheralPicker({
  onSelect,
  categories,
  excludeIds = [],
  placeholder = "Buscar por nome ou marca...",
  disabled = false,
  autoFocus = false,
}: PeripheralPickerProps) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<ShowcasePeripheral[]>([])
  const [loading, setLoading] = useState(false)
  // Índice destacado pela navegação por teclado (-1 = nada destacado).
  const [highlight, setHighlight] = useState(-1)
  const requestId = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const term = search.trim()

  useEffect(() => {
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
  }, [term])

  const visible = useMemo(
    () =>
      results
        .filter((p) => !categories || categories.includes(p.category))
        .filter((p) => !excludeIds.includes(p.id))
        .slice(0, MAX_RESULTS),
    // `excludeIds` chega como array novo a cada render do pai; comparar pelo
    // conteúdo evita refazer a lista (e piscar o destaque) à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, categories, excludeIds.join(",")]
  )

  // Toda lista nova recomeça sem destaque — senão o Enter escolheria o item
  // que estava naquela posição na busca anterior.
  useEffect(() => setHighlight(-1), [visible])

  function choose(peripheral: ShowcasePeripheral) {
    onSelect(peripheral)
    setSearch("")
    setResults([])
    setHighlight(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSearch("")
      setResults([])
      return
    }
    if (visible.length === 0) return

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const delta = event.key === "ArrowDown" ? 1 : -1
      const next = (highlight + delta + visible.length) % visible.length
      setHighlight(next)
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" })
      return
    }
    if (event.key === "Enter" && highlight >= 0) {
      event.preventDefault()
      choose(visible[highlight])
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="border-border bg-background pl-9 pr-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground/60" />
        ) : (
          search.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch("")
                setResults([])
                inputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              title="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )
        )}
      </div>

      {/* Campo vazio: em vez de nada, atalhos de marca pra começar a busca. */}
      {term.length === 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60">Marcas populares:</span>
          {BRAND_SUGGESTIONS.map((brand) => (
            <button
              key={brand}
              type="button"
              disabled={disabled}
              onClick={() => {
                setSearch(brand)
                inputRef.current?.focus()
              }}
              className="rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {brand}
            </button>
          ))}
        </div>
      )}

      {term.length === 1 && (
        <p className="px-1 text-xs text-muted-foreground/60">Digite pelo menos 2 caracteres.</p>
      )}

      {term.length >= 2 && !loading && visible.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-4 py-6 text-center">
          <PackageSearch className="size-5 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Nada encontrado para <span className="font-medium text-foreground">“{term}”</span>.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Só o que já está na wiki aparece aqui — peça o cadastro no fórum.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <>
          <ul
            ref={listRef}
            className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card"
          >
            {visible.map((peripheral, index) => (
              <li key={peripheral.id}>
                <button
                  type="button"
                  onClick={() => choose(peripheral)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    index === highlight ? "bg-muted/60" : "hover:bg-muted/40"
                  )}
                >
                  <div className="relative size-10 shrink-0 rounded-md bg-muted/30">
                    {peripheral.image_url ? (
                      <Image
                        src={peripheral.image_url}
                        alt={peripheral.name}
                        fill
                        sizes="40px"
                        className="object-contain p-0.5"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Sparkles className="size-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      <Highlighted text={peripheral.name} term={term} />
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {peripheral.brand}
                      {isCategory(peripheral.category) && (
                        <>
                          {" · "}
                          {CATEGORY_PLURAL_LABELS[peripheral.category]}
                        </>
                      )}
                    </p>
                  </div>

                  {peripheral.tier && <TierBadge tier={peripheral.tier} />}

                  {index === highlight && (
                    <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground/50" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <p className="px-1 text-[10px] text-muted-foreground/50">
            Navegue com ↑ ↓ e escolha com Enter.
          </p>
        </>
      )}
    </div>
  )
}

/** Selo do tier do catálogo, com a mesma paleta da tierlist pública. */
function TierBadge({ tier }: { tier: string }) {
  const mapped = mapTier(tier)
  const theme = TIER_THEMES[mapped]

  return (
    <span
      className={cn(
        "shrink-0 rounded-md bg-gradient-to-br px-1.5 py-0.5 text-[10px] font-black leading-none tracking-wide",
        theme.accent,
        theme.textColor
      )}
    >
      {mapped}
    </span>
  )
}

/**
 * Destaca o trecho buscado dentro do nome. Comparação sem acento/caixa (mesma
 * regra do `ilike` do banco), então "razer" acha "Razer" e "mous" acha "Mouse".
 */
function Highlighted({ text, term }: { text: string; term: string }) {
  const normalized = text.toLowerCase()
  const needle = term.toLowerCase()
  const start = normalized.indexOf(needle)
  if (start === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">
        {text.slice(start, start + needle.length)}
      </mark>
      {text.slice(start + needle.length)}
    </>
  )
}
