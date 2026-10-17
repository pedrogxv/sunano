import * as z from "zod"

/**
 * Formulário pós-compra de serviço.
 *
 * Serviço (Xianyu Express, consulta, setup) não começa sem saber o que o
 * cliente quer: nome do produto, link, cor. A descrição do anúncio pedia
 * para a pessoa abrir um ticket e mandar isso solto, e a equipe recebia
 * metade. Agora o admin define os campos no produto, o checkout tira um
 * snapshot deles no item do pedido (`items[].service_form`) e o comprador
 * preenche num card em Meus Pedidos e na janela pós-compra.
 *
 * O snapshot é o que vale para o pedido: mudar os campos do produto depois
 * não muda o que um pedido já pago pede (nem invalida resposta já dada).
 *
 * Módulo puro: admin, comprador e servidor validam pela mesma régua.
 */

/**
 * `image`: fotos enviadas pelo upload de anexo do suporte (bucket privado
 * `support`, nome `support-<uid>-<timestamp>.<ext>`), então a mesma foto vai
 * como anexo na mensagem do chamado. `choice`: caixas de marcar (uma ou mais)
 * entre as opções que o admin definiu.
 */
export type ServiceFormFieldType = "text" | "url" | "textarea" | "image" | "choice"

export const SERVICE_FORM_FIELD_TYPES: ServiceFormFieldType[] = ["text", "url", "textarea", "image", "choice"]

export const SERVICE_FORM_FIELD_TYPE_LABEL: Record<ServiceFormFieldType, string> = {
  text: "Texto curto",
  url: "Link",
  textarea: "Texto longo",
  image: "Foto",
  choice: "Opções (marcar uma ou mais)",
}

export type ServiceFormField = {
  /** Chave estável do campo (a resposta aponta para ela, não para a posição). */
  id: string
  label: string
  type: ServiceFormFieldType
  required: boolean
  placeholder: string | null
  /** Só `choice`: as opções marcáveis. Vazio nos outros tipos. */
  options: string[]
}

export const SERVICE_FORM_MAX_FIELDS = 10
export const SERVICE_FORM_LABEL_MAX = 80
export const SERVICE_FORM_PLACEHOLDER_MAX = 120
export const SERVICE_FORM_MAX_OPTIONS = 8
export const SERVICE_FORM_OPTION_MAX = 60
/** Fotos por campo `image`. O chamado aceita 3 anexos por mensagem. */
export const SERVICE_FORM_MAX_IMAGES = 3

/** Teto da resposta de texto por tipo (`image`/`choice` são listas, ver acima). */
export const SERVICE_FORM_ANSWER_MAX: Record<ServiceFormFieldType, number> = {
  text: 300,
  url: 1000,
  textarea: 2000,
  image: 1000,
  choice: SERVICE_FORM_OPTION_MAX,
}

/** Campo cuja resposta é uma lista (fotos, opções marcadas), não um texto. */
export function isListField(type: ServiceFormFieldType): boolean {
  return type === "image" || type === "choice"
}

const FIELD_ID = /^[a-z0-9-]{1,40}$/i

/**
 * Estados em que o comprador ainda preenche/corrige as informações. Depois
 * disso o serviço já foi feito (ou despachado), e corrigir é conversa no
 * chamado, não edição silenciosa.
 */
export const SERVICE_FORM_EDITABLE_STATUSES = ["paid", "awaiting_shipping_info"] as const

export function isServiceFormEditable(status: string): boolean {
  return (SERVICE_FORM_EDITABLE_STATUSES as readonly string[]).includes(status)
}

export function newServiceFormFieldId(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Campos como o admin salva (POST/PATCH do produto). */
export const serviceFormFieldsSchema = z
  .array(
    z.object({
      id: z.string().regex(FIELD_ID, "Campo do formulário com id inválido."),
      label: z
        .string()
        .trim()
        .min(1, "Todo campo do formulário pós-compra precisa de um nome.")
        .max(SERVICE_FORM_LABEL_MAX, `O nome do campo tem até ${SERVICE_FORM_LABEL_MAX} caracteres.`),
      type: z.enum(SERVICE_FORM_FIELD_TYPES as [ServiceFormFieldType, ...ServiceFormFieldType[]]),
      required: z.boolean(),
      placeholder: z
        .string()
        .trim()
        .max(SERVICE_FORM_PLACEHOLDER_MAX, `O exemplo do campo tem até ${SERVICE_FORM_PLACEHOLDER_MAX} caracteres.`)
        .transform((value) => value || null)
        .nullable(),
      options: z
        .array(
          z
            .string()
            .trim()
            .min(1, "Toda opção precisa de um texto.")
            .max(SERVICE_FORM_OPTION_MAX, `Cada opção tem até ${SERVICE_FORM_OPTION_MAX} caracteres.`)
        )
        .max(SERVICE_FORM_MAX_OPTIONS, `Um campo de opções tem até ${SERVICE_FORM_MAX_OPTIONS} opções.`)
        .optional()
        .default([]),
    })
  )
  .max(SERVICE_FORM_MAX_FIELDS, `O formulário pós-compra tem até ${SERVICE_FORM_MAX_FIELDS} campos.`)
  .superRefine((fields, ctx) => {
    const ids = fields.map((field) => field.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Dois campos do formulário com o mesmo id." })
    }
    for (const field of fields) {
      if (field.type !== "choice") continue
      if (field.options.length < 2) {
        ctx.addIssue({ code: "custom", message: `"${field.label}" precisa de pelo menos duas opções.` })
      }
      if (new Set(field.options.map((option) => option.toLowerCase())).size !== field.options.length) {
        ctx.addIssue({ code: "custom", message: `"${field.label}" tem opções repetidas.` })
      }
    }
  })
  // Opção só existe em `choice`: as dos outros tipos (sobra de quando o campo
  // era de opções no editor) não vão para o banco.
  .transform((fields) => fields.map((field) => (field.type === "choice" ? field : { ...field, options: [] })))

/**
 * Leitura tolerante (coluna do produto, snapshot do pedido): o que não tiver
 * o formato some, em vez de derrubar a tela do pedido.
 */
export function readServiceFormFields(raw: unknown): ServiceFormField[] {
  if (!Array.isArray(raw)) return []
  const fields: ServiceFormField[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const { id, label, type, required, placeholder, options } = entry as Record<string, unknown>
    if (typeof id !== "string" || !FIELD_ID.test(id)) continue
    if (typeof label !== "string" || !label.trim()) continue
    if (!SERVICE_FORM_FIELD_TYPES.includes(type as ServiceFormFieldType)) continue
    const choices =
      type === "choice" && Array.isArray(options)
        ? options
            .filter((option): option is string => typeof option === "string" && option.trim().length > 0)
            .map((option) => option.trim())
            .slice(0, SERVICE_FORM_MAX_OPTIONS)
        : []
    // Campo de opções sem opção não tem o que marcar: some, igual ao resto.
    if (type === "choice" && choices.length === 0) continue
    fields.push({
      id,
      label: label.trim(),
      type: type as ServiceFormFieldType,
      required: required === true,
      placeholder: typeof placeholder === "string" && placeholder.trim() ? placeholder.trim() : null,
      options: choices,
    })
  }
  return fields.slice(0, SERVICE_FORM_MAX_FIELDS)
}

/** Uma linha do pedido que tem formulário (índice em `items`). */
export type ServiceFormLine = {
  line: number
  productId: string | null
  productName: string
  fields: ServiceFormField[]
}

/** As linhas do pedido cujo snapshot traz campos. Vazio = nada a preencher. */
export function serviceFormLines(
  items: readonly { id?: string | null; name?: string | null; service_form?: unknown }[] | null | undefined
): ServiceFormLine[] {
  return (items ?? []).flatMap((item, line) => {
    const fields = readServiceFormFields(item?.service_form)
    return fields.length > 0
      ? [{ line, productId: item.id ?? null, productName: item.name ?? "Serviço", fields }]
      : []
  })
}

/**
 * `value` é sempre o texto legível (opções marcadas juntadas por vírgula,
 * "2 fotos"), para quem só lê. `items` existe em `image` (as URLs, re-assinadas
 * na leitura) e em `choice` (as opções marcadas, para reabrir a edição).
 */
export type ServiceFormAnswer = {
  field_id: string
  label: string
  value: string
  type?: ServiceFormFieldType
  items?: string[]
}

/** Valor que o comprador manda por campo: texto, ou lista em `image`/`choice`. */
export type ServiceFormValue = string | string[]

/** O que fica gravado em `store_orders.service_form_answers`. */
export type OrderServiceFormAnswers = {
  lines: { line: number; product_id: string | null; product_name: string; answers: ServiceFormAnswer[] }[]
  submitted_at: string
  updated_at: string
}

export function readServiceFormAnswers(raw: unknown): OrderServiceFormAnswers | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Partial<OrderServiceFormAnswers>
  if (!Array.isArray(value.lines) || typeof value.submitted_at !== "string") return null
  return {
    lines: value.lines.filter(
      (line) => line && typeof line.line === "number" && Array.isArray(line.answers)
    ),
    submitted_at: value.submitted_at,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : value.submitted_at,
  }
}

/** Link aceito: http(s) com host. Vai para `<a href>` na tela da equipe. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0
  } catch {
    return false
  }
}

/** As entradas de um valor de lista, limpas (sem vazio nem repetida). */
export function listValue(raw: ServiceFormValue | undefined): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw] : []
  return [...new Set(list.map((entry) => entry.trim()).filter(Boolean))]
}

/**
 * Erro da resposta de um campo, ou null quando está boa. A posse das fotos
 * (URL do upload DESTE usuário) só dá para conferir no servidor:
 * `isOwnedSupportImageUrl` em `order-service-form-repository`.
 */
export function serviceFormAnswerError(field: ServiceFormField, rawValue: ServiceFormValue | undefined): string | null {
  if (field.type === "image") {
    const urls = listValue(rawValue)
    if (urls.length === 0) return field.required ? `Envie a foto de "${field.label}".` : null
    if (urls.length > SERVICE_FORM_MAX_IMAGES) return `"${field.label}" aceita até ${SERVICE_FORM_MAX_IMAGES} fotos.`
    return null
  }
  if (field.type === "choice") {
    const picked = listValue(rawValue)
    if (picked.length === 0) return field.required ? `Marque uma opção em "${field.label}".` : null
    if (picked.some((option) => !field.options.includes(option))) return `Opção inválida em "${field.label}".`
    return null
  }
  if (Array.isArray(rawValue)) return `Resposta inválida em "${field.label}".`
  const value = (rawValue ?? "").trim()
  if (!value) return field.required ? `Preencha "${field.label}".` : null
  if (value.length > SERVICE_FORM_ANSWER_MAX[field.type]) {
    return `"${field.label}" tem até ${SERVICE_FORM_ANSWER_MAX[field.type]} caracteres.`
  }
  if (field.type === "url" && !isHttpUrl(value)) {
    return `"${field.label}" precisa ser um link começando com https://`
  }
  return null
}

/** Respostas de uma linha, por id de campo, para pré-preencher a edição. */
export function answersByFieldId(
  answers: OrderServiceFormAnswers | null,
  line: number
): Record<string, ServiceFormValue> {
  const entry = answers?.lines.find((item) => item.line === line)
  return Object.fromEntries(
    (entry?.answers ?? []).map((answer) => [answer.field_id, Array.isArray(answer.items) ? answer.items : answer.value])
  )
}

/** Texto legível de uma resposta de lista. */
export function listAnswerText(type: ServiceFormFieldType, items: string[]): string {
  if (type === "image") return items.length === 1 ? "1 foto" : `${items.length} fotos`
  return items.join(", ")
}
