"use client"

import { useEffect, useState } from "react"
import { Tag } from "lucide-react"

import { Combobox } from "@/components/ui/combobox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type ForumCategoryOption = {
  id: string
  slug: string
  name: string
  children: { id: string; slug: string; name: string }[]
}

function useForumCategories() {
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

  return { categories, loading }
}

function pickerState(categories: ForumCategoryOption[], value: string) {
  const selectedRoot = categories.find(
    (root) => root.id === value || root.children.some((child) => child.id === value)
  )
  return {
    selectedRoot,
    rootValue: selectedRoot?.id ?? "",
    subValue: selectedRoot && selectedRoot.id !== value ? value : "",
  }
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
  const { categories, loading } = useForumCategories()
  const { selectedRoot, rootValue, subValue } = pickerState(categories, value)

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

/**
 * Variante compacta: um pill "Categoria" (estilo "Add flair") que abre um
 * popover com o mesmo par de comboboxes. Usada no formulário de novo post,
 * onde a categoria não precisa de destaque visual permanente.
 */
export function CategoryPickerCompact({
  value,
  onChange,
  "aria-invalid": ariaInvalid,
}: {
  value: string
  onChange: (categoryId: string) => void
  "aria-invalid"?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { categories, loading } = useForumCategories()
  const { selectedRoot, rootValue, subValue } = pickerState(categories, value)

  const label = categories
    .flatMap((c) => [c, ...c.children])
    .find((c) => c.id === value)?.name

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-invalid={ariaInvalid}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            label
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          } ${ariaInvalid ? "border-destructive/60" : ""}`}
        >
          <Tag className="size-3" />
          {label ?? "Categoria"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <Combobox
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={rootValue}
            onValueChange={onChange}
            placeholder={loading ? "Carregando…" : "Categoria"}
            searchPlaceholder="Buscar categoria…"
            emptyText="Nenhuma categoria encontrada."
            disabled={loading}
            className="border-border bg-muted/20"
          />
          {selectedRoot && selectedRoot.children.length > 0 && (
            <Combobox
              options={selectedRoot.children.map((c) => ({ value: c.id, label: c.name }))}
              value={subValue}
              onValueChange={onChange}
              placeholder="Subcategoria (opcional)"
              searchPlaceholder="Buscar subcategoria…"
              emptyText="Nenhuma subcategoria encontrada."
              className="border-border bg-muted/20"
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
