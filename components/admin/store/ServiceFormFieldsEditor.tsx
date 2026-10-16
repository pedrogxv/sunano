"use client"

import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  SERVICE_FORM_FIELD_TYPE_LABEL,
  SERVICE_FORM_FIELD_TYPES,
  SERVICE_FORM_LABEL_MAX,
  SERVICE_FORM_MAX_FIELDS,
  SERVICE_FORM_MAX_IMAGES,
  SERVICE_FORM_MAX_OPTIONS,
  SERVICE_FORM_OPTION_MAX,
  SERVICE_FORM_PLACEHOLDER_MAX,
  newServiceFormFieldId,
  type ServiceFormField,
  type ServiceFormFieldType,
} from "@/lib/store-service-form"

/**
 * Campos que o comprador de um serviço preenche depois de pagar (card em
 * Meus Pedidos e janela pós-compra). Ver lib/store-service-form.ts.
 */
export function ServiceFormFieldsEditor({
  fields,
  onChange,
}: {
  fields: ServiceFormField[]
  onChange: (fields: ServiceFormField[]) => void
}) {
  function update(index: number, patch: Partial<ServiceFormField>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)))
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function add() {
    if (fields.length >= SERVICE_FORM_MAX_FIELDS) return
    onChange([
      ...fields,
      { id: newServiceFormFieldId(), label: "", type: "text", required: true, placeholder: null, options: [] },
    ])
  }

  function changeType(index: number, type: ServiceFormFieldType) {
    // Campo que vira "Opções" já nasce com duas linhas para preencher.
    const options = fields[index].options
    update(index, { type, options: type === "choice" && options.length === 0 ? ["", ""] : options })
  }

  function setOption(index: number, optionIndex: number, value: string) {
    update(index, { options: fields[index].options.map((option, i) => (i === optionIndex ? value : option)) })
  }

  return (
    <div className="space-y-2 border-t border-border/60 pt-4">
      <Label>Formulário pós-compra</Label>
      <p className="text-[10px] text-muted-foreground/70">
        O que o comprador preenche depois de pagar: aparece num card em Meus Pedidos e na janela de confirmação, e as
        respostas chegam no chamado do pedido. Vale para os pedidos feitos depois de salvar; os já pagos continuam
        pedindo os campos da época. Sem campos, o comprador só recebe a conversa livre.
      </p>

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-2 rounded-lg border border-border bg-muted/10 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={field.label}
                maxLength={SERVICE_FORM_LABEL_MAX}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Nome do campo (ex: Link do produto)"
                className="min-w-[160px] flex-1 text-sm"
              />
              <Select value={field.type} onValueChange={(v) => changeType(index, v as ServiceFormFieldType)}>
                <SelectTrigger className="h-9 w-[150px] border-border bg-muted/20 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_FORM_FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {SERVICE_FORM_FIELD_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={field.required}
                  onCheckedChange={(checked) => update(index, { required: checked === true })}
                />
                Obrigatório
              </label>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Subir campo"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Descer campo"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-red-400"
                  onClick={() => onChange(fields.filter((_, i) => i !== index))}
                  aria-label="Remover campo"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            {field.type === "choice" && (
              <div className="space-y-1.5">
                {field.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-1.5">
                    <Input
                      value={option}
                      maxLength={SERVICE_FORM_OPTION_MAX}
                      onChange={(e) => setOption(index, optionIndex, e.target.value)}
                      placeholder={`Opção ${optionIndex + 1} (ex: ${optionIndex === 0 ? "Novo" : "Seminovo"})`}
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground hover:text-red-400"
                      disabled={field.options.length <= 2}
                      onClick={() => update(index, { options: field.options.filter((_, i) => i !== optionIndex) })}
                      aria-label="Remover opção"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                {field.options.length < SERVICE_FORM_MAX_OPTIONS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                    onClick={() => update(index, { options: [...field.options, ""] })}
                  >
                    <Plus className="size-3" />
                    Adicionar opção
                  </Button>
                )}
                <p className="text-[10px] text-muted-foreground/70">
                  O comprador pode marcar uma ou mais. Com &quot;Obrigatório&quot;, precisa marcar pelo menos uma.
                </p>
              </div>
            )}
            <Input
              value={field.placeholder ?? ""}
              maxLength={SERVICE_FORM_PLACEHOLDER_MAX}
              onChange={(e) => update(index, { placeholder: e.target.value || null })}
              placeholder={
                field.type === "image" || field.type === "choice"
                  ? "Dica abaixo do campo (opcional)"
                  : "Exemplo dentro do campo (opcional)"
              }
              className="text-xs"
            />
            {field.type === "image" && (
              <p className="text-[10px] text-muted-foreground/70">
                Até {SERVICE_FORM_MAX_IMAGES} fotos. Elas também vão como anexo na conversa do pedido.
              </p>
            )}
          </div>
        ))}
      </div>

      {fields.length < SERVICE_FORM_MAX_FIELDS && (
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
          <Plus className="size-3.5" />
          Adicionar campo
        </Button>
      )}
    </div>
  )
}
