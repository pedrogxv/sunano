"use client"

import { useRef, useState } from "react"
import { ClipboardList, ImagePlus, Loader2, Send, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { orderNumber } from "@/lib/order-number"
import {
  SERVICE_FORM_ANSWER_MAX,
  SERVICE_FORM_MAX_IMAGES,
  answersByFieldId,
  isListField,
  listValue,
  serviceFormAnswerError,
  type OrderServiceFormAnswers,
  type ServiceFormField,
  type ServiceFormLine,
  type ServiceFormValue,
} from "@/lib/store-service-form"

/**
 * Fotos de um campo `image`. Sobe pelo upload de anexo do suporte: o arquivo
 * nasce no bucket privado com o nome da conta, e o servidor confere a posse
 * (`isOwnedSupportImageUrl`) antes de gravar a resposta.
 */
function ServiceFormImageField({
  inputId,
  urls,
  onChange,
  disabled,
}: {
  inputId: string
  urls: string[]
  onChange: (urls: string[]) => void
  disabled: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/support/upload-image", { method: "POST", body: formData })
      const data = (await res.json().catch(() => ({}))) as { publicUrl?: string; error?: string }
      if (!res.ok || !data.publicUrl) throw new Error(data.error ?? "Não foi possível enviar a foto.")
      onChange([...urls, data.publicUrl])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a foto.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {urls.map((url) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(urls.filter((entry) => entry !== url))}
              disabled={disabled}
              aria-label="Remover foto"
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {urls.length < SERVICE_FORM_MAX_IMAGES && (
          <button
            type="button"
            id={inputId}
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {uploading ? "Enviando" : "Adicionar"}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void handleFile(file)
        }}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function ServiceFormChoiceField({
  inputId,
  field,
  picked,
  onChange,
  disabled,
}: {
  inputId: string
  field: ServiceFormField
  picked: string[]
  onChange: (picked: string[]) => void
  disabled: boolean
}) {
  return (
    <div id={inputId} className="flex flex-wrap gap-x-5 gap-y-2">
      {field.options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={picked.includes(option)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              // Na ordem das opções, não na ordem dos cliques.
              onChange(field.options.filter((entry) => (entry === option ? checked === true : picked.includes(entry))))
            }
          />
          {option}
        </label>
      ))}
    </div>
  )
}

/**
 * Campos do formulário pós-compra de serviço, com o envio. Mora dentro de um
 * Dialog (janela pós-compra e Meus Pedidos), por isso o rodapé é um
 * `DialogFooter`. O servidor valida tudo de novo pelo snapshot do pedido.
 */
export function ServiceOrderForm({
  orderId,
  lines,
  answers,
  onSaved,
  secondaryAction,
}: {
  orderId: string
  lines: ServiceFormLine[]
  /** Respostas já enviadas: a edição abre preenchida. */
  answers: OrderServiceFormAnswers | null
  onSaved: () => void
  /** Ação à esquerda do botão de enviar (fechar, ver conversa). */
  secondaryAction?: React.ReactNode
}) {
  const [values, setValues] = useState<Record<number, Record<string, ServiceFormValue>>>(() =>
    Object.fromEntries(lines.map((line) => [line.line, answersByFieldId(answers, line.line)]))
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function setValue(line: number, fieldId: string, value: ServiceFormValue) {
    setValues((prev) => ({ ...prev, [line]: { ...prev[line], [fieldId]: value } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    for (const line of lines) {
      for (const field of line.fields) {
        const issue = serviceFormAnswerError(field, values[line.line]?.[field.id])
        if (issue) {
          setError(issue)
          return
        }
      }
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/store/orders/${orderId}/service-form`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line) => ({
            line: line.line,
            values: Object.fromEntries(
              line.fields.map((field) => {
                const value = values[line.line]?.[field.id]
                return [field.id, isListField(field.type) ? listValue(value) : typeof value === "string" ? value.trim() : ""]
              })
            ),
          })),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(data.message ?? data.error ?? "Não foi possível enviar as informações.")
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar as informações.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {lines.map((line) => (
          <fieldset key={line.line} className="space-y-3">
            {lines.length > 1 && (
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {line.productName}
              </legend>
            )}
            {line.fields.map((field) => {
              const inputId = `service-form-${line.line}-${field.id}`
              const raw = values[line.line]?.[field.id]
              const value = typeof raw === "string" ? raw : ""
              const max = SERVICE_FORM_ANSWER_MAX[field.type]
              return (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={inputId} className="text-sm">
                    {field.label}
                    {field.required ? (
                      <span className="text-red-400" aria-hidden>
                        *
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                    )}
                  </Label>
                  {field.type === "image" ? (
                    <ServiceFormImageField
                      inputId={inputId}
                      urls={listValue(raw)}
                      onChange={(urls) => setValue(line.line, field.id, urls)}
                      disabled={saving}
                    />
                  ) : field.type === "choice" ? (
                    <ServiceFormChoiceField
                      inputId={inputId}
                      field={field}
                      picked={listValue(raw)}
                      onChange={(picked) => setValue(line.line, field.id, picked)}
                      disabled={saving}
                    />
                  ) : field.type === "textarea" ? (
                    <Textarea
                      id={inputId}
                      value={value}
                      onChange={(e) => setValue(line.line, field.id, e.target.value.slice(0, max))}
                      placeholder={field.placeholder ?? undefined}
                      rows={3}
                      required={field.required}
                      disabled={saving}
                    />
                  ) : (
                    <Input
                      id={inputId}
                      type={field.type === "url" ? "url" : "text"}
                      inputMode={field.type === "url" ? "url" : undefined}
                      value={value}
                      onChange={(e) => setValue(line.line, field.id, e.target.value.slice(0, max))}
                      placeholder={field.placeholder ?? (field.type === "url" ? "https://" : undefined)}
                      required={field.required}
                      disabled={saving}
                    />
                  )}
                  {isListField(field.type) && field.placeholder && (
                    <p className="text-xs text-muted-foreground">{field.placeholder}</p>
                  )}
                </div>
              )
            })}
          </fieldset>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <DialogFooter className="gap-2 sm:gap-2">
        {secondaryAction}
        <Button type="submit" className="gap-2" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {answers ? "Salvar alterações" : "Enviar informações"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** O formulário em janela própria, aberto pelo card do pedido em Meus Pedidos. */
export function OrderServiceFormDialog({
  orderId,
  lines,
  answers,
  open,
  onOpenChange,
  onSaved,
}: {
  orderId: string | null
  lines: ServiceFormLine[]
  answers: OrderServiceFormAnswers | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-sky-400" />
            Informações do pedido{orderId ? ` #${orderNumber(orderId)}` : ""}
          </DialogTitle>
          <DialogDescription>
            A equipe precisa disto para começar o seu serviço. Tudo chega na conversa do pedido.
          </DialogDescription>
        </DialogHeader>
        {/* `key` remonta o form por pedido: abrir o B depois do A não herda as respostas do A. */}
        {orderId && open && (
          <ServiceOrderForm
            key={orderId}
            orderId={orderId}
            lines={lines}
            answers={answers}
            onSaved={onSaved}
            secondaryAction={
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
