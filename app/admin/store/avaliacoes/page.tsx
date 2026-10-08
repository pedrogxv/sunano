"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ReviewGrantsSection } from "@/components/admin/store/ReviewGrantsSection"
import { usePageHeader } from "@/components/providers/page-header-context"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  TESTIMONIAL_SOURCES,
  TESTIMONIAL_SOURCE_LABEL,
  type StoreTestimonial,
  type TestimonialSource,
} from "@/lib/store-testimonials"
import { cn } from "@/lib/utils"

type Draft = {
  customerName: string
  source: TestimonialSource
  productLabel: string
  rating: number
  body: string
  proofImageUrl: string
  purchasedOn: string
  isPublished: boolean
}

const EMPTY_DRAFT: Draft = {
  customerName: "",
  source: "whatsapp",
  productLabel: "",
  rating: 5,
  body: "",
  proofImageUrl: "",
  purchasedOn: "",
  isPublished: true,
}

function toDraft(t: StoreTestimonial): Draft {
  return {
    customerName: t.customer_name,
    source: t.source,
    productLabel: t.product_label ?? "",
    rating: t.rating,
    body: t.body,
    proofImageUrl: t.proof_image_url ?? "",
    purchasedOn: t.purchased_on ?? "",
    isPublished: t.is_published,
  }
}

function toPayload(d: Draft, productId: string | null) {
  return {
    customerName: d.customerName,
    source: d.source,
    productId,
    productLabel: d.productLabel,
    rating: d.rating,
    body: d.body,
    proofImageUrl: d.proofImageUrl,
    purchasedOn: d.purchasedOn || null,
    isPublished: d.isPublished,
  }
}

export default function AdminStoreTestimonialsPage() {
  usePageHeader("Avaliações da Loja", "Clientes que compraram fora do site: liberar avaliação ou cadastrar depoimento.")

  const [items, setItems] = useState<StoreTestimonial[] | null>(null)
  const [editing, setEditing] = useState<StoreTestimonial | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/store-testimonials", { cache: "no-store" })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(json?.error ?? "Erro ao carregar depoimentos.")
      setItems([])
      return
    }
    setItems(json.testimonials)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/store-testimonials", { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, json: await res.json().catch(() => null) }))
      .then(({ ok, json }) => {
        if (cancelled) return
        if (!ok) toast.error(json?.error ?? "Erro ao carregar depoimentos.")
        setItems(ok ? json.testimonials : [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  function openNew() {
    setDraft(EMPTY_DRAFT)
    setEditing("new")
  }

  function openEdit(t: StoreTestimonial) {
    setDraft(toDraft(t))
    setEditing(t)
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    const isNew = editing === "new"
    const res = await fetch(isNew ? "/api/admin/store-testimonials" : `/api/admin/store-testimonials/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(draft, isNew ? null : editing.product_id)),
    })
    const json = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      toast.error(json?.error ?? "Erro ao salvar.")
      return
    }
    toast.success(isNew ? "Depoimento criado." : "Depoimento atualizado.")
    setEditing(null)
    await load()
  }

  async function togglePublished(t: StoreTestimonial) {
    const res = await fetch(`/api/admin/store-testimonials/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload({ ...toDraft(t), isPublished: !t.is_published }, t.product_id)),
    })
    if (!res.ok) {
      toast.error("Erro ao alterar a visibilidade.")
      return
    }
    await load()
  }

  async function remove(t: StoreTestimonial) {
    if (!window.confirm(`Remover o depoimento de ${t.customer_name}?`)) return
    const res = await fetch(`/api/admin/store-testimonials/${t.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao remover.")
      return
    }
    toast.success("Depoimento removido.")
    await load()
  }

  async function uploadProof(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    const res = await fetch("/api/admin/store-testimonials/upload-image", { method: "POST", body: form })
    const json = await res.json().catch(() => null)
    setUploading(false)
    if (!res.ok) {
      toast.error(json?.error ?? "Erro ao enviar a imagem.")
      return
    }
    setDraft((d) => ({ ...d, proofImageUrl: json.publicUrl }))
  }

  if (items === null) return <BoxLoader />

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <ReviewGrantsSection />

      <div className="mt-4 flex items-start justify-between gap-3 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold">Depoimentos (cliente sem conta)</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
          Use só depoimentos reais, de gente que de fato comprou. Eles aparecem em /loja/avaliacoes como
          &quot;Cliente Sunano&quot;, separados das avaliações com compra verificada no site. Anexar o print da
          conversa ou a foto do produto recebido dá muito mais credibilidade. Se o cliente tem conta no site,
          prefira liberar a avaliação acima: ele escreve com as próprias palavras e ganha Aura.
          </p>
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum depoimento cadastrado ainda.
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((t) => (
            <li key={t.id} className="flex gap-3 rounded-xl border border-border bg-card p-3.5">
              {t.proof_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.proof_image_url} alt="" className="size-16 shrink-0 rounded-lg object-cover object-top" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{t.customer_name}</span>
                  <span className="text-xs text-muted-foreground">via {TESTIMONIAL_SOURCE_LABEL[t.source]}</span>
                  <span className="inline-flex items-center gap-0.5 text-xs text-amber-400">
                    <Star className="size-3 fill-current" /> {t.rating}
                  </span>
                  {!t.is_published && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      Oculto
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-[13px] text-muted-foreground">{t.body}</p>
                {t.product_label && <p className="truncate text-xs text-muted-foreground/70">{t.product_label}</p>}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <Button variant="ghost" size="icon" onClick={() => togglePublished(t)} aria-label="Mostrar ou ocultar">
                  {t.is_published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Editar">
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(t)} aria-label="Remover">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo depoimento" : "Editar depoimento"}</DialogTitle>
            <DialogDescription>Copie o texto como o cliente escreveu. Não edite o sentido.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-name">Nome do cliente</Label>
                <Input
                  id="t-name"
                  value={draft.customerName}
                  maxLength={80}
                  placeholder="Ex: João S."
                  onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-source">Onde comprou</Label>
                <select
                  id="t-source"
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value as TestimonialSource })}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {TESTIMONIAL_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {TESTIMONIAL_SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-product">Produto</Label>
                <Input
                  id="t-product"
                  value={draft.productLabel}
                  maxLength={120}
                  placeholder="Ex: Mouse Lamzu Atlantis"
                  onChange={(e) => setDraft({ ...draft, productLabel: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-date">Data da compra</Label>
                <Input
                  id="t-date"
                  type="date"
                  value={draft.purchasedOn}
                  onChange={(e) => setDraft({ ...draft, purchasedOn: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Nota</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setDraft({ ...draft, rating: n })} aria-label={`${n} estrelas`}>
                    <Star
                      className={cn("size-6", n <= draft.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-body">Depoimento</Label>
              <Textarea
                id="t-body"
                rows={4}
                value={draft.body}
                maxLength={1500}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Prova (print da conversa ou foto do produto)</Label>
              {draft.proofImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.proofImageUrl} alt="" className="max-h-40 w-full rounded-lg object-cover object-top" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadProof(file)
                  e.target.value = ""
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="size-4" /> {uploading ? "Enviando..." : draft.proofImageUrl ? "Trocar imagem" : "Enviar imagem"}
                </Button>
                {draft.proofImageUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, proofImageUrl: "" })}>
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Cubra telefone, sobrenome e endereço do cliente no print antes de enviar.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
              />
              Publicado na loja
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
