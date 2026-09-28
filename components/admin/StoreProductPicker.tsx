"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"

import { Combobox } from "@/components/ui/combobox"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { formatBRL } from "@/lib/format"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

function optionLabel(product: StoreProductCard): string {
  return product.brand ? `${product.name} · ${product.brand}` : product.name
}

/**
 * Escolha de UM produto da Loja no painel (Hero, campanha da barra
 * comercial). Busca no servidor pela mesma busca da vitrine (nome, marca,
 * sensor…), inclusive produtos pausados: o painel avisa quando o escolhido
 * não está no ar, em vez de esconder.
 */
export function StoreProductPicker({
  value,
  onChange,
  placeholder = "Buscar produto…",
}: {
  value: StoreProductCard | null
  onChange: (product: StoreProductCard | null) => void
  placeholder?: string
}) {
  const [search, setSearch] = useState("")
  const debounced = useDebouncedValue(search, 300)
  const [results, setResults] = useState<StoreProductCard[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = debounced.trim()
    const controller = new AbortController()
    const params = new URLSearchParams({ pageSize: "20" })
    if (term) params.set("search", term)
    const start = window.setTimeout(() => setLoading(true), 0)
    fetch(`/api/admin/store/products?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data: { products?: StoreProductCard[] }) => setResults(data.products ?? []))
      .catch((error) => {
        if (error?.name !== "AbortError") setResults([])
      })
      .finally(() => setLoading(false))
    return () => {
      window.clearTimeout(start)
      controller.abort()
    }
  }, [debounced])

  // O escolhido entra nas opções mesmo fora do resultado da busca atual:
  // sem isso o gatilho mostraria o placeholder no lugar do nome.
  const pool = useMemo(() => {
    const byId = new Map(results.map((product) => [product.id, product]))
    if (value) byId.set(value.id, value)
    return byId
  }, [results, value])

  const options = useMemo(
    () => [...pool.values()].map((product) => ({ value: product.id, label: optionLabel(product) })),
    [pool]
  )

  return (
    <div className="space-y-2">
      <Combobox
        options={options}
        value={value?.id ?? ""}
        onValueChange={(id) => onChange(pool.get(id) ?? null)}
        onSearchChange={setSearch}
        loading={loading}
        placeholder={placeholder}
        searchPlaceholder="Nome, marca ou sensor…"
        emptyText="Nenhum produto encontrado."
      />
      {value && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {value.images?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.images[0]} alt="" className="size-full object-contain p-0.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{value.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatBRL(value.promo_price_cents ?? value.price_cents)}
              {!value.is_active && <span className="ml-1.5 font-semibold text-amber-400">· pausado, não aparece na Loja</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remover produto"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
