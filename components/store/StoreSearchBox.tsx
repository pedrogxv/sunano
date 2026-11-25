"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { getCategoryIcon } from "@/lib/store-category-icons"
import type { StoreSearchSuggestion } from "@/lib/server/repositories/store-repository"
import { storageImgProps } from "@/lib/storage-thumb"

interface StoreSearchBoxProps {
  className?: string
  /**
   * Posição/largura do painel de resultados. O padrão ocupa a largura do
   * campo; quem tem um campo estreito alarga o painel (ver StoreCategoryNav):
   * com a largura do campo, o título virava "ATK RS6 ..." e cinco produtos da
   * mesma marca ficavam indistinguíveis.
   */
  panelClassName?: string
  inputClassName?: string
  iconClassName?: string
  placeholder?: string
}

/**
 * Busca "em tempo real" da Loja: dropdown com os melhores resultados
 * enquanto digita, Enter ou "ver todos" leva pra `/loja?q=` com os filtros
 * completos. Debounce + AbortController evitam martelar `/api/store/search`
 * a cada tecla; a rota em si tem rate limit no servidor.
 *
 * O termo casa com nome, marca, categoria, sensor e palavras-chave do
 * Database ao mesmo tempo (store_search_products). Quando quem casou foi o
 * sensor, o resultado diz isso: sem a dica, "3950" devolvendo "ATK X1 Ultimate"
 * parece erro de busca.
 */
export function StoreSearchBox({ className, inputClassName, iconClassName, panelClassName = "inset-x-0", placeholder = "Buscar produto, marca ou sensor" }: StoreSearchBoxProps) {
  const router = useRouter()
  const listboxId = useId()
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 300)
  const [results, setResults] = useState<StoreSearchSuggestion[]>([])
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
      .then((data: { items: StoreSearchSuggestion[] }) => {
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
        router.push(`/loja/${product.slug}`)
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
      {/* O campo tem o PRÓPRIO contexto de posição: assim o ícone e o
          spinner ficam presos nele mesmo quando a raiz vira `static` para o
          painel se ancorar na ilha (celular, ver StoreCategoryNav). */}
      <div className="relative">
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
      </div>

      {showDropdown && (
        <div
          className={cn(
            // Fundo SÓLIDO, sem backdrop-filter: o painel mora dentro do vidro
            // da ilha, que já tem um. Filtro dentro de filtro faz o Chrome
            // amostrar o fundo errado — o painel saía translúcido no desktop
            // (o hero vazava por trás do texto) e escurecia a tela no celular.
            "absolute top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_24px_56px_-18px_rgba(0,0,0,0.9)] animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none",
            panelClassName
          )}
        >
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
                      href={`/loja/${product.slug}`}
                      onMouseEnter={() => setHighlighted(idx)}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-2.5 transition-colors",
                        idx === highlighted ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                      )}
                    >
                      {product.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          {...storageImgProps(product.images[0], 48)}
                          alt=""
                          className="size-12 shrink-0 rounded-[10px] bg-[#1c1c1c] object-contain p-1"
                        />
                      ) : (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-[#1c1c1c]">
                          <Icon className="size-[22px] opacity-60" style={{ color: tint }} strokeWidth={1.4} />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {/* Duas linhas, não uma: o que separa um produto do
                            outro (modelo, versão, cor) costuma vir DEPOIS da
                            marca, justo a parte que o `truncate` cortava. O
                            `title` mostra o nome inteiro se passar de duas. */}
                        <span title={product.name} className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{product.name}</span>
                        {(product.brand || product.search_sensor) && (
                          <span className="truncate text-[11px] text-[#7a7a7a]">
                            {product.brand}
                            {product.brand && product.search_sensor && " · "}
                            {product.search_sensor && (
                              <span className="font-semibold text-sky-300/90">Sensor {product.search_sensor}</span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 self-center text-[13px] font-bold tabular-nums text-emerald-400">
                        {product.is_payment_complement ? "Valor do pedido" : formatBRL(price)}
                      </span>
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
