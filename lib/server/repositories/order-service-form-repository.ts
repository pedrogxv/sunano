import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { orderNumber } from "@/lib/order-number"
import { postUserSupportMessage, type RepositoryResult } from "@/lib/server/repositories/support-repository"
import { getUserProfile } from "@/lib/server/repositories/users-repository"
import {
  MAX_SUPPORT_IMAGES_PER_MESSAGE,
  isOwnedSupportImageUrl,
} from "@/lib/server/support-media"
import {
  isListField,
  listAnswerText,
  listValue,
  isServiceFormEditable,
  readServiceFormAnswers,
  serviceFormAnswerError,
  serviceFormLines,
  type OrderServiceFormAnswers,
  type ServiceFormAnswer,
  type ServiceFormField,
  type ServiceFormValue,
} from "@/lib/store-service-form"

export type ServiceFormSubmission = {
  lines: { line: number; values: Record<string, ServiceFormValue> }[]
}

/**
 * URL de foto como fica gravada: sem a query (o token da assinatura expira
 * em minutos e não serve para nada depois). O caminho `/object/sign/support/`
 * continua sendo lido por `signSupportImageUrls`.
 */
function storedImageUrl(url: string): string {
  return url.split("?")[0]
}

function toAnswer(field: ServiceFormField, raw: ServiceFormValue | undefined): ServiceFormAnswer | null {
  if (isListField(field.type)) {
    const list = listValue(raw)
    if (list.length === 0) return null
    const items = field.type === "image" ? list.map(storedImageUrl) : list
    return { field_id: field.id, label: field.label, type: field.type, value: listAnswerText(field.type, items), items }
  }
  const value = typeof raw === "string" ? raw.trim() : ""
  return value ? { field_id: field.id, label: field.label, type: field.type, value } : null
}

/**
 * Grava o formulário pós-compra de um pedido de serviço (Meus Pedidos e a
 * janela pós-compra).
 *
 * Quem diz QUAIS campos existem é o snapshot do pedido (`items[].service_form`),
 * nunca o corpo: o cliente manda só valores por id de campo, e o rótulo
 * gravado sai do snapshot. Assim a resposta não inventa campo, e a tela da
 * equipe lê o que foi perguntado de fato.
 *
 * Posse no próprio UPDATE (`metadata->>user_id`), mesmo motivo de
 * `setOrderShippingAddress`: checar antes e gravar depois deixa um id
 * adivinhado passar quando surge um segundo chamador.
 *
 * Depois de gravar, as respostas vão como mensagem do cliente no chamado do
 * pedido, que é onde a equipe atende. Best-effort: se o chamado ainda não
 * existe ou é a vez da equipe falar (regra de turno), a resposta continua
 * gravada e aparece no pedido no admin.
 */
export async function submitOrderServiceForm(
  orderId: string,
  userId: string,
  submission: ServiceFormSubmission
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: order } = await db
    .from("store_orders")
    .select("id, status, items, metadata, service_form_answers")
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
    .maybeSingle()

  // Mesma resposta para "não existe" e "não é seu".
  if (!order) return { ok: false, error: "Pedido não encontrado.", status: 404 }

  const lines = serviceFormLines(order.items as { id?: string; name?: string; service_form?: unknown }[])
  if (lines.length === 0) {
    return { ok: false, error: "Este pedido não tem informações a preencher.", status: 400 }
  }
  if (!isServiceFormEditable(order.status)) {
    return {
      ok: false,
      error:
        order.status === "pending"
          ? "As informações do serviço são preenchidas depois do pagamento."
          : "Este pedido não aceita mais alterações por aqui. Fale com a equipe na conversa do pedido.",
      status: 400,
    }
  }

  const now = new Date().toISOString()
  const answerLines: OrderServiceFormAnswers["lines"] = []
  for (const line of lines) {
    const values = submission.lines.find((entry) => entry.line === line.line)?.values ?? {}
    for (const field of line.fields) {
      const issue = serviceFormAnswerError(field, values[field.id])
      if (issue) return { ok: false, error: issue, status: 400 }
      // Foto só do upload DESTA conta: host, bucket e nome exato. Sem isso o
      // corpo gravava a URL de um anexo alheio, e a leitura a assinaria.
      if (field.type === "image" && listValue(values[field.id]).some((url) => !isOwnedSupportImageUrl(url, userId))) {
        return { ok: false, error: `Envie a foto de "${field.label}" de novo.`, status: 400 }
      }
    }
    answerLines.push({
      line: line.line,
      product_id: line.productId,
      product_name: line.productName,
      answers: line.fields
        .map((field) => toAnswer(field, values[field.id]))
        .filter((answer): answer is ServiceFormAnswer => answer !== null),
    })
  }

  const previous = readServiceFormAnswers(order.service_form_answers)
  const stored: OrderServiceFormAnswers = {
    lines: answerLines,
    submitted_at: previous?.submitted_at ?? now,
    updated_at: now,
  }

  const { error } = await db
    .from("store_orders")
    .update({ service_form_answers: stored })
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
  if (error) {
    console.error("[order-service-form] submit:", error)
    return { ok: false, error: "Não foi possível salvar as informações.", status: 500 }
  }

  const ticketId = (order.metadata as Record<string, unknown> | null)?.service_ticket_id
  if (typeof ticketId === "string") {
    const profile = await getUserProfile(userId).catch(() => null)
    const posted = await postUserSupportMessage({
      ticketId,
      userId,
      authorName: profile?.display_name || "Cliente",
      body: formatServiceFormMessage(orderId, stored, Boolean(previous)),
      // As fotos vão como anexo: é na conversa que a equipe olha o produto.
      imageUrls: stored.lines
        .flatMap((line) => line.answers)
        .flatMap((answer) => (answer.type === "image" ? (answer.items ?? []) : []))
        .slice(0, MAX_SUPPORT_IMAGES_PER_MESSAGE),
    })
    if (!posted.ok && posted.status !== 409) {
      console.error("[order-service-form] mensagem no chamado:", posted.error)
    }
  }

  return { ok: true }
}

/** Texto da mensagem no chamado: uma linha por campo, agrupado por serviço. */
function formatServiceFormMessage(orderId: string, answers: OrderServiceFormAnswers, isUpdate: boolean): string {
  const multiple = answers.lines.length > 1
  const blocks = answers.lines.map((line) => {
    const rows = line.answers
      .map((answer) => `${answer.label}: ${answer.value}${answer.type === "image" ? " (em anexo)" : ""}`)
      .join("\n")
    return multiple ? `${line.product_name}\n${rows}` : rows
  })
  const title = isUpdate
    ? `Informações do pedido #${orderNumber(orderId)} atualizadas:`
    : `Informações do pedido #${orderNumber(orderId)}:`
  return [title, ...blocks].join("\n\n").slice(0, 4000)
}
