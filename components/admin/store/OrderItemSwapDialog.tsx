"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type ProductOption = { id: string; name: string }
type VariantOption = { id: string; label: string }

/**
 * Troca o produto de um item do pedido: acabou o estoque do que foi comprado
 * e o cliente levou outro. A avaliação sai do item do pedido, então é isso que
 * deixa o cliente avaliar o produto que recebeu (ver order-item-swap-repository).
 */
export function OrderItemSwapDialog({
  orderId,
  line,
  onOpenChange,
  onSwapped,
}: {
  orderId: string
  /** Item sendo trocado; null fecha o diálogo. */
  line: { index: number; label: string } | null
  onOpenChange: (open: boolean) => void
  onSwapped: (items: Record<string, unknown>[]) => void
}) {
  const open = line !== null
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(false)
  const [product, setProduct] = useState<ProductOption | null>(null)
  const [variants, setVariants] = useState<VariantOption[] | null>(null)
  const [variantId, setVariantId] = useState("")
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch("")
    setProduct(null)
    setVariants(null)
    setVariantId("")
  }, [open, line?.index])

  useEffect(() => {
    if (!open || product) return
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("q", search.trim())
        const res = await fetch(`/api/admin/store/orders/products?${params.toString()}`)
        const data = (await res.json()) as { products?: ProductOption[] }
        setResults(data.products ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, search, product])

  async function pickProduct(option: ProductOption) {
    setProduct(option)
    setVariants(null)
    setVariantId("")
    try {
      const res = await fetch(`/api/admin/store/orders/products?variantsOf=${option.id}`)
      const data = (await res.json()) as { variants?: VariantOption[] }
      const list = data.variants ?? []
      setVariants(list)
      if (list.length === 1) setVariantId(list[0].id)
    } catch {
      setVariants([])
    }
  }

  async function handleSave() {
    if (!line || !product) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_item",
          lineIndex: line.index,
          productId: product.id,
          variantId: variantId || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        items?: Record<string, unknown>[]
        movedReviews?: number
      }
      if (!res.ok || !data.items) throw new Error(data.error ?? "Erro ao trocar o produto")
      onSwapped(data.items)
      toast.success(
        data.movedReviews
          ? "Produto trocado. A avaliação que o cliente já tinha deixado foi para o produto novo."
          : "Produto trocado. O cliente já pode avaliar o produto novo."
      )
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao trocar o produto")
    } finally {
      setSaving(false)
    }
  }

  const needsVariant = (variants?.length ?? 0) > 0
  const canSave = Boolean(product) && variants !== null && (!needsVariant || variantId !== "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar produto do item</DialogTitle>
          <DialogDescription>
            Use quando o cliente recebeu outro produto (ex: acabou o estoque). O pedido passa a mostrar o produto
            novo e o cliente pode avaliá-lo. Preço, total e estoque não mudam.
          </DialogDescription>
        </DialogHeader>

        {line && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{line.label}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={cn("min-w-0 truncate", product ? "text-foreground" : "text-muted-foreground")}>
              {product?.name ?? "escolha abaixo"}
            </span>
          </div>
        )}

        {product ? (
          <div className="space-y-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setProduct(null)}>
              Escolher outro produto
            </Button>
            {variants === null ? (
              <p className="text-xs text-muted-foreground">Carregando cores…</p>
            ) : needsVariant ? (
              <div className="space-y-1.5">
                <Label>Cor entregue</Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a cor" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        ) : (
          <Command shouldFilter={false} className="rounded-lg border border-border/60">
            <CommandInput placeholder="Buscar produto…" value={search} onValueChange={setSearch} />
            <CommandList className="max-h-60">
              {!loading && <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>}
              <CommandGroup>
                {results.map((option) => (
                  <CommandItem key={option.id} value={option.id} onSelect={() => pickProduct(option)}>
                    {option.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Trocando…" : "Trocar produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
