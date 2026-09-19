"use client"

import { useState } from "react"
import { AlertTriangle, Boxes, Loader2, Lock, Trash2, Truck, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { compressImageFile, type CompressImageOptions } from "@/lib/client/compress-image"
import type { AuraItemAdmin, AuraItemKind } from "@/lib/server/repositories/aura-store-repository"
import {
  auraItemKindMeta,
  CONVERTIBLE_AURA_ITEM_KINDS,
  isConvertibleAuraItemKind,
} from "@/lib/aura-item-kinds"
import { VIP_AURA_DISCOUNT_PERCENT } from "@/lib/aura-pricing"
import { UPLOAD_LIMITS, formatUploadLimit } from "@/lib/upload-limits"

/**
 * Comprime antes de subir: o upload passa por rota, e todo corpo que passa por
 * rota tem teto (ver `lib/upload-limits.ts`). Um PNG grande de moldura nem
 * chegava a rodar a validação — a plataforma respondia "Request Entity Too
 * Large" em texto puro e o `res.json()` do front estourava com "Unexpected
 * token 'R'". Comprimir tira o upload dessa faixa.
 */
const IMAGE_COMPRESS_OPTIONS: CompressImageOptions = {
  maxDimension: 1600,
  targetBytes: 400 * 1024,
  skipBelowBytes: 150 * 1024,
}

/**
 * A moldura é sobreposta ao avatar: o fundo transparente é o próprio formato
 * do asset, então ela sai em PNG. JPEG pintaria o fundo de preto e a moldura
 * chegaria como um quadrado opaco por cima da foto.
 */
const FRAME_COMPRESS_OPTIONS: CompressImageOptions = {
  ...IMAGE_COMPRESS_OPTIONS,
  preserveTransparency: true,
}


/**
 * Cartão de escolha do tipo. Substitui o `<select>`: entre "moldura" e
 * "produto físico" a diferença não é de rótulo, é de consequência — um
 * consome estoque real e gera entrega. Mostrar as duas naturezas lado a lado,
 * com o que cada uma implica, evita cadastrar prêmio real como cosmético.
 */
function KindChoice({
  kind,
  selected,
  onSelect,
}: {
  kind: AuraItemKind
  selected: boolean
  onSelect: () => void
}) {
  const meta = auraItemKindMeta(kind)
  const Icon = meta.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-foreground/30 bg-foreground/5"
          : "border-border bg-card hover:border-foreground/20"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          meta.badgeClassName
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{meta.longLabel}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {meta.blurb}
        </span>
      </span>
    </button>
  )
}

interface AuraItemFormProps {
  item?: AuraItemAdmin
  onSuccess: (item: AuraItemAdmin) => void
  onCancel: () => void
}

export function AuraItemForm({ item, onSuccess, onCancel }: AuraItemFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploadingPreview, setUploadingPreview] = useState(false)
  const [uploadingFrame, setUploadingFrame] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // O kind é escolhido na CRIAÇÃO. Na edição só permitimos a conversão entre
  // "Moldura de avatar" e "Produto" (avatar_frame ⇄ peripheral) — os outros
  // kinds (VIP, escudo, troca de nome, fundo) têm RPC e slug próprios que não
  // podem mudar. `convertible` guarda essa condição.
  const [kind, setKind] = useState<AuraItemKind>(item?.kind ?? "avatar_frame")
  const isPeripheral = kind === "peripheral"
  const kindConvertible = !item || isConvertibleAuraItemKind(item.kind)
  const kindMeta = auraItemKindMeta(kind)

  const [formData, setFormData] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    auraCost: item?.auraCost?.toString() ?? "",
    sortOrder: item?.sortOrder?.toString() ?? "0",
    stock: item?.stock?.toString() ?? "1",
    active: item?.active !== false,
  })

  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null)
  const [frameAssetUrl, setFrameAssetUrl] = useState<string | null>(item?.frameAssetUrl ?? null)

  function set<K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  async function uploadFile(file: File, options: CompressImageOptions): Promise<string> {
    const prepared = await compressImageFile(file, options)
    if (prepared.size > UPLOAD_LIMITS.image) {
      throw new Error(
        `Arquivo muito grande (máx. ${formatUploadLimit(UPLOAD_LIMITS.image)}).`
      )
    }

    const fd = new FormData()
    fd.set("file", prepared)
    const res = await fetch("/api/admin/aura-itens/upload-image", { method: "POST", body: fd })
    const data = (await res.json()) as { ok?: boolean; publicUrl?: string; error?: string }
    if (!res.ok || !data.ok || !data.publicUrl) {
      throw new Error(data.error ?? "Erro ao enviar imagem")
    }
    return data.publicUrl
  }

  async function handlePreviewChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPreview(true)
    setError(null)
    try {
      setImageUrl(await uploadFile(file, IMAGE_COMPRESS_OPTIONS))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploadingPreview(false)
      e.target.value = ""
    }
  }

  async function handleFrameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFrame(true)
    setError(null)
    try {
      setFrameAssetUrl(await uploadFile(file, FRAME_COMPRESS_OPTIONS))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploadingFrame(false)
      e.target.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!formData.name.trim()) {
        throw new Error("Informe o nome do item.")
      }

      const auraCost = parseInt(formData.auraCost, 10)
      if (isNaN(auraCost) || auraCost <= 0) {
        throw new Error("Custo em Aura inválido. Use um inteiro maior que zero.")
      }

      const sortOrder = parseInt(formData.sortOrder, 10)
      if (isNaN(sortOrder)) {
        throw new Error("Ordem inválida.")
      }

      let stock = 1
      if (isPeripheral) {
        stock = parseInt(formData.stock, 10)
        if (isNaN(stock) || stock < 1) {
          throw new Error("Unidades inválidas. Use um inteiro maior ou igual a 1.")
        }
      }

      if (isPeripheral) {
        if (!imageUrl) {
          throw new Error("Envie a foto do periférico.")
        }
      } else if (!frameAssetUrl) {
        throw new Error("Envie a imagem da moldura (o PNG/SVG sobreposto ao avatar).")
      }

      // Na edição, o `kind` só vai no payload se de fato mudou e a conversão é
      // permitida (avatar_frame ⇄ peripheral). Criação sempre manda o kind.
      const kindChanged = item != null && kindConvertible && kind !== item.kind

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        imageUrl,
        frameAssetUrl: isPeripheral ? null : frameAssetUrl,
        auraCost,
        sortOrder,
        ...(isPeripheral ? { stock } : {}),
        ...(item ? { active: formData.active } : {}),
        ...(item ? (kindChanged ? { kind } : {}) : { kind }),
      }

      const url = item ? `/api/admin/aura-itens/${item.id}` : "/api/admin/aura-itens"
      const method = item ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await res.json()) as { item?: AuraItemAdmin; error?: string }

      if (!res.ok || !data.item) {
        throw new Error(data.error ?? "Erro ao salvar item")
      }

      toast.success(item ? "Item atualizado" : "Item criado", {
        description: data.item.name,
      })

      onSuccess(data.item)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar"
      setError(message)
      toast.error("Erro ao salvar item", { description: message })
    } finally {
      setLoading(false)
    }
  }

  const uploading = uploadingPreview || uploadingFrame

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Tipo — select quando é conversível (avatar_frame ⇄ peripheral, seja
          na criação ou editando um desses dois). Kinds especiais (VIP, escudo,
          etc.) mostram texto fixo. */}
      <div className="space-y-2">
        <Label>Tipo *</Label>
        {kindConvertible ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {CONVERTIBLE_AURA_ITEM_KINDS.map((k) => (
              <KindChoice key={k} kind={k} selected={kind === k} onSelect={() => setKind(k)} />
            ))}
          </div>
        ) : (
          // Kinds especiais (VIP, escudo, troca de nome, fundo) têm RPC e slug
          // próprios: o código depende deles, então o tipo é só informativo.
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                kindMeta.badgeClassName
              )}
            >
              <kindMeta.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {kindMeta.longLabel}
                <Lock className="size-3 text-muted-foreground" />
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {kindMeta.blurb} O tipo é fixo — o código depende do slug deste item.
              </p>
            </div>
          </div>
        )}
        {item && kindConvertible && kind !== item.kind && (
          <Alert className="border-amber-500/30 bg-amber-500/10 py-2">
            <AlertTriangle className="size-3.5 text-amber-400" />
            <AlertDescription className="text-xs text-amber-200">
              Você está mudando o tipo deste item. A conversão só é segura se ninguém resgatou ou
              equipou ele ainda.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Estoque e regras do prêmio físico — o bloco que não existe para
          itens digitais. Agrupado para deixar claro que essas condições vêm
          todas juntas com o tipo "produto". */}
      {isPeripheral && (
        <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">Estoque real</h3>
          </div>

          <div className="space-y-2">
            <Label>Unidades disponíveis *</Label>
            <Input
              required
              type="number"
              min={1}
              step={1}
              value={formData.stock}
              onChange={(e) => set("stock", e.target.value)}
              placeholder="Ex: 1"
              className="max-w-[160px]"
            />
            <p className="text-[10px] text-muted-foreground">
              Quantas pessoas podem resgatar este produto no total. Ao zerar, o item some da
              Central de Aura — ninguém vê &ldquo;esgotado&rdquo;, ele simplesmente sai da lista.
            </p>
          </div>

          <ul className="space-y-1.5 border-t border-amber-500/20 pt-3 text-[11px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <Truck className="mt-0.5 size-3 shrink-0 text-amber-400/80" />
              Gera um pedido de entrega e exige endereço completo no resgate.
            </li>
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 size-3 shrink-0 text-amber-400/80" />
              Só quem tem Trust Factor &quot;Muito Bom&quot; ou superior resgata, no máximo 1 unidade por pessoa.
            </li>
            <li className="flex items-start gap-2">
              <Boxes className="mt-0.5 size-3 shrink-0 text-amber-400/80" />
              Sem desconto VIP: o preço em Aura é o que todo mundo paga.
            </li>
          </ul>
        </div>
      )}

      {/* Nome + Custo */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nome do item *</Label>
          <Input
            required
            minLength={2}
            maxLength={100}
            value={formData.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={isPeripheral ? "Ex: Teclado Wooting 60HE" : "Ex: Moldura Dourada"}
          />
        </div>

        <div className="space-y-2">
          <Label>Custo em Aura *</Label>
          <Input
            required
            type="number"
            min={1}
            step={1}
            value={formData.auraCost}
            onChange={(e) => set("auraCost", e.target.value)}
            placeholder={isPeripheral ? "Ex: 25000" : "Ex: 250"}
          />
          <p className="text-[10px] text-muted-foreground/60">
            {isPeripheral
              ? "Preço cheio — prêmios físicos não recebem o desconto VIP."
              : `VIP paga ${VIP_AURA_DISCOUNT_PERCENT}% menos que este valor.`}
          </p>
        </div>
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label>Descrição (aparece no card da loja)</Label>
        <textarea
          value={formData.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Ex: Moldura exclusiva para os usuários mais ativos."
          rows={3}
          maxLength={500}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          )}
        />
      </div>

      {/* Ordem + Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Ordem de exibição</Label>
          <Input
            type="number"
            step={1}
            value={formData.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground/60">Menor número aparece primeiro na loja.</p>
        </div>

        {item && (
          <div className="space-y-2">
            <Label>Status</Label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => set("active", e.target.checked)}
                className="size-4 rounded border-border"
              />
              Ativo (visível na loja)
            </label>
          </div>
        )}
      </div>

      {/* Imagens */}
      <div className={cn("grid gap-4", !isPeripheral && "md:grid-cols-2")}>
        <div className="space-y-3">
          <Label>{isPeripheral ? "Foto do periférico *" : "Preview do card (opcional)"}</Label>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <div className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={formData.name} className="h-full w-full object-contain p-1" />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-2.5 text-white" />
                </button>
              </div>
            ) : (
              <label className={cn(
                "flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-border hover:text-foreground/80",
                uploadingPreview && "cursor-wait opacity-50"
              )}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePreviewChange}
                  disabled={uploadingPreview}
                />
                {uploadingPreview ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                <span className="text-[9px]">PNG</span>
              </label>
            )}
            <p className="text-[10px] text-muted-foreground">
              {isPeripheral
                ? "Foto do produto que aparece no card da loja."
                : "Se vazio, mostra um ícone padrão no card da loja."}
            </p>
          </div>
        </div>

        {!isPeripheral && (
        <div className="space-y-3">
          <Label>Moldura (asset sobreposto ao avatar) *</Label>
          <div className="flex items-center gap-3">
            {frameAssetUrl ? (
              <div className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameAssetUrl} alt="Moldura" className="h-full w-full object-contain p-1" />
                <button
                  type="button"
                  onClick={() => setFrameAssetUrl(null)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-2.5 text-white" />
                </button>
              </div>
            ) : (
              <label className={cn(
                "flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-border hover:text-foreground/80",
                uploadingFrame && "cursor-wait opacity-50"
              )}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFrameChange}
                  disabled={uploadingFrame}
                />
                {uploadingFrame ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                <span className="text-[9px]">PNG</span>
              </label>
            )}
            <p className="text-[10px] text-muted-foreground">
              Fundo transparente, quadrada, sobreposta ao avatar do perfil.
            </p>
          </div>
        </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {item ? "Salvar alterações" : "Criar item"}
        </Button>
      </div>
    </form>
  )
}
