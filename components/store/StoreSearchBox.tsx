"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { getCategoryIcon } from "@/lib/store-category-icons"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

interface StoreSearchBoxProps {
  className?: string
  inputClassName?: string
  iconClassName?: string
  placeholder?: string
}

/**
 * Busca "em tempo real" da Loja: dropdown com os melhores resultados
 * enquanto digita, Enter ou "ver todos" leva pra `/loja?q=` com os filtros
 * completos. Debounce + AbortController evitam martelar `/api/store/search`
 * a cada tecla; a rota em si tem rate limit no servidor.
 */
export function StoreSearchBox({ className, inputClassName, iconClassName, placeholder = "Buscar produto ou marca" }: StoreSearchBoxProps) {
  const router = useRouter()
  const listboxId = useId()
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 300)
  const [results, setResults] = useState<StoreProductCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = debouncedQuery.trim()
  const hasQuery = trimmed.length >= 2

  useEffect(() => {
    if (!hasQuery) {
      Promise.resolve().then(() => {
        setResults([])
        setIsLoading(false)
      })
      return
    }
    const controller = new AbortController()
    Promise.resolve().then(() => setIsLoading(true))
    fetch(`/api/store/search?q=${encodeURIComponent(trimmed)}&limit=5`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { items: StoreProductCard[] }) => {
        setResults(data.items ?? [])
        setHighlighted(-1)
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setResults([])
          setHighlighted(-1)
        }
      })
      .finally(() => setIsLoading(false))
    return () => controller.abort()
  }, [trimmed, hasQuery])

  const visibleResults = useMemo(() => (hasQuery ? results : []), [hasQuery, results])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const showDropdown = isOpen && query.trim().length >= 2
  // "Ver todos" só faz sentido quando pode haver mais resultado do que o
  // dropdown mostra — caso contrário some pra não sugerir mais itens à toa.
  const showSeeAll = visibleResults.length >= 5 || (!isLoading && visibleResults.length > 0)

  const goToResults = (term: string) => {
    const value = term.trim()
    if (!value) return
    setIsOpen(false)
    inputRef.current?.blur()
    router.push(`/loja?q=${encodeURIComponent(value)}#produtos`)
  }

  const items = useMemo(() => visibleResults.slice(0, 5), [visibleResults])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (highlighted >= 0 && items[highlighted]) {
        const product = items[highlighted]
        setIsOpen(false)
        router.push(`/${product.type === "bazaar" ? "bazar" : "loja"}/${product.slug}`)
        return
      }
      goToResults(query)
      return
    }
    if (e.key === "Escape") {
      setIsOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!showDropdown || items.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % items.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => (h <= 0 ? items.length - 1 : h - 1))
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6e6e6e]", iconClassName)} />
      <input
        ref={inputRef}
        aria-label="Buscar produtos"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
      />
      {isLoading && showDropdown && (
        <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[#6e6e6e]" />
      )}

      {showDropdown && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[13px] border border-[#262626] bg-[#141414] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)]">
          {items.length === 0 && !isLoading && (
            <p className="px-4 py-3.5 text-[12.5px] text-[#7a7a7a]">
              Nenhum produto encontrado para &ldquo;{trimmed}&rdquo;.
            </p>
          )}

          {items.length > 0 && (
            <ul id={listboxId} role="listbox" className="flex flex-col py-1.5">
              {items.map((product, idx) => {
                const { icon: Icon, tint } = getCategoryIcon(product.category)
                const price = product.promo_price_cents ?? product.price_cents
                return (
                  <li key={product.id}>
                    <Link
                      href={`/${product.type === "bazaar" ? "bazar" : "loja"}/${product.slug}`}
                      onMouseEnter={() => setHighlighted(idx)}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-2 transition-colors",
                        idx === highlighted ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                      )}
                    >
                      {product.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0]}
                          alt=""
                          className="size-9 shrink-0 rounded-[8px] bg-[#1c1c1c] object-contain p-1"
                        />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[#1c1c1c]">
                          <Icon className="size-[18px] opacity-60" style={{ color: tint }} strokeWidth={1.4} />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12.5px] font-semibold text-white">{product.name}</span>
                        {product.brand && <span className="truncate text-[11px] text-[#7a7a7a]">{product.brand}</span>}
                      </span>
                      <span className="shrink-0 text-[12.5px] font-bold text-emerald-400">{formatBRL(price)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {showSeeAll && (
            <button
              type="button"
              onClick={() => goToResults(query)}
              className="w-full border-t border-[#262626] px-3.5 py-2.5 text-left text-[12px] font-bold text-[#dcdcdc] transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              Ver todos os resultados para &ldquo;{trimmed}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
