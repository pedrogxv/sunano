"use client"

import { Fragment, useState } from "react"
import { Ban, ImageIcon, Layers, Loader2, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** O que o admin digitou numa combinação. Campo vazio = herda da cor/opção/produto. */
export type SkuDraft = {
  sku: string
  price_brl: string
  promo_brl: string
  stock: string
  image_url: string | null
  is_sold_out: boolean
}

export const EMPTY_SKU_DRAFT: SkuDraft = { sku: "", price_brl: "", promo_brl: "", stock: "", image_url: null, is_sold_out: false }

export function isEmptySkuDraft(draft: SkuDraft): boolean {
  return (
    !draft.sku.trim() &&
    !draft.price_brl.trim() &&
    !draft.promo_brl.trim() &&
    !draft.stock.trim() &&
    draft.image_url === null &&
    !draft.is_sold_out
  )
}

/** Chave da combinação no formulário: cor + opções, ambas pelo `clientKey` da linha (que é o id para o que já existe). */
export function skuDraftKey(variantClientKey: string | null, optionClientKeys: readonly string[]): string {
  return `${variantClientKey ?? ""}|${[...optionClientKeys].sort().join(",")}`
}

type MatrixVariant = { clientKey: string; label: string; color: string | null; images: string[] }
type MatrixGroup = { name: string; options: { clientKey: string; label: string }[] }

export type MatrixCombination = {
  key: string
  variantClientKey: string | null
  optionClientKeys: string[]
  label: string
  color: string | null
}

/** Todas as combinações vendáveis: cada cor × uma opção de cada grupo. */
export function buildCombinations(variants: readonly MatrixVariant[], groups: readonly MatrixGroup[]): MatrixCombination[] {
  const colors = variants.filter((v) => v.label.trim())
  const activeGroups = groups
    .map((group) => ({ ...group, options: group.options.filter((o) => o.label.trim()) }))
    .filter((group) => group.name.trim() && group.options.length > 0)
  if (colors.length === 0 && activeGroups.length === 0) return []

  let partials: { keys: string[]; labels: string[] }[] = [{ keys: [], labels: [] }]
  for (const group of activeGroups) {
    partials = partials.flatMap((partial) =>
      group.options.map((option) => ({ keys: [...partial.keys, option.clientKey], labels: [...partial.labels, option.label.trim()] }))
    )
  }

  const colorRows: (MatrixVariant | null)[] = colors.length > 0 ? colors : [null]
  return colorRows.flatMap((color) =>
    partials.map((partial) => ({
      key: skuDraftKey(color?.clientKey ?? null, partial.keys),
      variantClientKey: color?.clientKey ?? null,
      optionClientKeys: partial.keys,
      label: [color?.label.trim(), ...partial.labels].filter(Boolean).join(" · "),
      color: color?.color ?? null,
    }))
  )
}

/** Acima disso a tabela deixa de ser editável à mão; o admin divide em anúncios. */
const MAX_COMBINATIONS = 200

interface ProductSkuMatrixProps {
  variants: MatrixVariant[]
  groups: MatrixGroup[]
  /** Fotos do produto, para escolher a da combinação sem subir de novo. */
  productImages: string[]
  drafts: Record<string, SkuDraft>
  onChange: (key: string, draft: SkuDraft) => void
  onUploadImage: (file: File) => Promise<string>
}

/**
 * Matriz de combinações (SKU): uma linha por cor × opção de cada grupo, com
 * código, preço PIX, promoção, estoque, foto e "esgotado" próprios.
 *
 * Tudo opcional: linha vazia herda da cor/opção/produto e não é gravada. É o
 * que deixa "Mini" e "Max" do mesmo mouse terem preço, estoque e foto
 * diferentes sem virar dois anúncios. A regra de leitura é a de
 * `resolveSelection` (lib/store-sku.ts), a mesma do checkout.
 */
export function ProductSkuMatrix({ variants, groups, productImages, drafts, onChange, onUploadImage }: ProductSkuMatrixProps) {
  const [imageRow, setImageRow] = useState<string | null>(null)
  const [uploadingRow, setUploadingRow] = useState<string | null>(null)
  const combinations = buildCombinations(variants, groups)
  if (combinations.length === 0) return null

  if (combinations.length > MAX_COMBINATIONS) {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
        {combinations.length} combinações é mais do que dá para editar aqui (até {MAX_COMBINATIONS}). Divida o produto em
        anúncios separados.
      </p>
    )
  }

  function update(key: string, patch: Partial<SkuDraft>) {
    onChange(key, { ...(drafts[key] ?? EMPTY_SKU_DRAFT), ...patch })
  }

  async function handleUpload(key: string, file: File) {
    setUploadingRow(key)
    try {
      update(key, { image_url: await onUploadImage(file) })
      setImageRow(null)
    } finally {
      setUploadingRow(null)
    }
  }

  return (
    <div className="space-y-2 border-t border-border/60 pt-4">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Combinações (SKU)</p>
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Uma linha por combinação de cor e variantes. Preencha só o que muda: campo vazio usa o valor da cor, da variante
        ou do produto. Estoque vazio = sem controle na combinação. Preço é o do PIX (o cartão é calculado).
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] border-collapse text-[12px]">
          <thead className="bg-muted/30 text-[10.5px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2 text-left font-semibold">Combinação</th>
              <th className="px-1.5 py-2 text-left font-semibold">SKU</th>
              <th className="px-1.5 py-2 text-left font-semibold">Preço PIX</th>
              <th className="px-1.5 py-2 text-left font-semibold">Promoção</th>
              <th className="px-1.5 py-2 text-left font-semibold">Estoque</th>
              <th className="px-1.5 py-2 text-center font-semibold">Foto</th>
              <th className="px-2.5 py-2 text-center font-semibold">Esgotado</th>
            </tr>
          </thead>
          <tbody>
            {combinations.map((combo) => {
              const draft = drafts[combo.key] ?? EMPTY_SKU_DRAFT
              const variantImages = variants.find((v) => v.clientKey === combo.variantClientKey)?.images ?? []
              const imageChoices = [...new Set([...variantImages, ...productImages])]
              return (
                <Fragment key={combo.key}>
                  <tr className={cn("border-t border-border/60", draft.is_sold_out && "bg-red-500/[0.06]")}>
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        {combo.color && (
                          <span className="inline-block size-2.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: combo.color }} />
                        )}
                        {combo.label}
                      </span>
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Input
                        value={draft.sku}
                        maxLength={64}
                        onChange={(e) => update(combo.key, { sku: e.target.value })}
                        placeholder="Opcional"
                        className="h-8 w-[130px] font-mono text-xs"
                      />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Input
                        inputMode="decimal"
                        value={draft.price_brl}
                        onChange={(e) => update(combo.key, { price_brl: e.target.value })}
                        placeholder="Herda"
                        className="h-8 w-[96px] text-xs"
                      />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Input
                        inputMode="decimal"
                        value={draft.promo_brl}
                        onChange={(e) => update(combo.key, { promo_brl: e.target.value })}
                        placeholder="—"
                        className="h-8 w-[96px] text-xs"
                      />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        value={draft.stock}
                        onChange={(e) => update(combo.key, { stock: e.target.value })}
                        placeholder="—"
                        className="no-spinner h-8 w-[72px] text-xs"
                      />
                    </td>
                    <td className="px-1.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => setImageRow((current) => (current === combo.key ? null : combo.key))}
                        aria-label={`Foto de ${combo.label}`}
                        aria-expanded={imageRow === combo.key}
                        className="inline-flex size-9 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20 text-muted-foreground hover:border-foreground/30"
                      >
                        {draft.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={draft.image_url} alt="" className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <ImageIcon className="size-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => update(combo.key, { is_sold_out: !draft.is_sold_out })}
                        aria-pressed={draft.is_sold_out}
                        aria-label={`${combo.label}: ${draft.is_sold_out ? "esgotado" : "disponível"}`}
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-md border transition-colors",
                          draft.is_sold_out
                            ? "border-red-500/60 bg-red-500/90 text-white hover:bg-red-500"
                            : "border-border text-muted-foreground hover:border-foreground/30"
                        )}
                      >
                        {draft.is_sold_out ? <Ban className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
                      </button>
                    </td>
                  </tr>
                  {imageRow === combo.key && (
                    <tr className="bg-muted/10">
                      <td colSpan={7} className="px-2.5 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10.5px] text-muted-foreground">Foto que abre a galeria nesta combinação:</span>
                          {imageChoices.map((url) => (
                            <button
                              key={url}
                              type="button"
                              onClick={() => {
                                update(combo.key, { image_url: url })
                                setImageRow(null)
                              }}
                              className={cn(
                                "size-12 overflow-hidden rounded-md border-[1.5px] bg-muted/20",
                                draft.image_url === url ? "border-emerald-500" : "border-border hover:border-foreground/30"
                              )}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="h-full w-full object-contain p-0.5" />
                            </button>
                          ))}
                          <label className="flex h-12 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-[11px] text-muted-foreground hover:border-foreground/30">
                            {uploadingRow === combo.key ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                            Enviar nova
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingRow !== null}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.target.value = ""
                                if (file) void handleUpload(combo.key, file)
                              }}
                            />
                          </label>
                          {draft.image_url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-[11px] text-muted-foreground"
                              onClick={() => {
                                update(combo.key, { image_url: null })
                                setImageRow(null)
                              }}
                            >
                              <X className="size-3.5" />
                              Sem foto própria
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
