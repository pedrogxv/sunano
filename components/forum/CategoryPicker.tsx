"use client"

import { useEffect, useState } from "react"

import { Combobox } from "@/components/ui/combobox"

export type ForumCategoryOption = {
  id: string
  slug: string
  name: string
  children: { id: string; slug: string; name: string }[]
}

/**
 * Seletor de categoria + subcategoria (2 níveis) do fórum. Busca a árvore
 * pública de `/api/forum/categories` uma vez e resolve, a partir do
 * `value` selecionado, qual raiz está ativa e se ela tem subcategorias —
 * a segunda combobox só aparece quando existirem.
 */
export function CategoryPicker({
  value,
  onChange,
  disabled,
  "aria-invalid": ariaInvalid,
}: {
  value: string
  onChange: (categoryId: string) => void
  disabled?: boolean
  "aria-invalid"?: boolean
}) {
  const [categories, setCategories] = useState<ForumCategoryOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/forum/categories")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCategories(data?.categories ?? [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedRoot = categories.find(
    (root) => root.id === value || root.children.some((child) => child.id === value)
  )
  const rootValue = selectedRoot?.id ?? ""
  const subValue = selectedRoot && selectedRoot.id !== value ? value : ""

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <Combobox
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        value={rootValue}
        onValueChange={onChange}
        placeholder={loading ? "Carregando…" : "Categoria"}
        searchPlaceholder="Buscar categoria…"
        emptyText="Nenhuma categoria encontrada."
        disabled={disabled || loading}
        aria-invalid={ariaInvalid}
        className="min-w-0 flex-1 border-border bg-muted/20"
      />
      {selectedRoot && selectedRoot.children.length > 0 && (
        <Combobox
          options={selectedRoot.children.map((c) => ({ value: c.id, label: c.name }))}
          value={subValue}
          onValueChange={onChange}
          placeholder="Subcategoria (opcional)"
          searchPlaceholder="Buscar subcategoria…"
          emptyText="Nenhuma subcategoria encontrada."
          disabled={disabled}
          className="min-w-0 flex-1 border-border bg-muted/20"
        />
      )}
    </div>
  )
}
