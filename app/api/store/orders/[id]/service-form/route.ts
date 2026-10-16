import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { submitOrderServiceForm } from "@/lib/server/repositories/order-service-form-repository"
import {
  SERVICE_FORM_ANSWER_MAX,
  SERVICE_FORM_MAX_FIELDS,
  SERVICE_FORM_MAX_IMAGES,
  SERVICE_FORM_MAX_OPTIONS,
} from "@/lib/store-service-form"

export const runtime = "nodejs"

const LONGEST_ANSWER = Math.max(...Object.values(SERVICE_FORM_ANSWER_MAX))
// Lista: fotos (URL assinada, com token) ou opções marcadas.
const LONGEST_LIST = Math.max(SERVICE_FORM_MAX_IMAGES, SERVICE_FORM_MAX_OPTIONS)

// Só o formato do corpo. Quais campos existem, quais são obrigatórios e o
// limite de cada um saem do snapshot do pedido, no repositório.
const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        line: z.number().int().min(0).max(200),
        values: z
          .record(
            z.string().max(40),
            z.union([z.string().max(LONGEST_ANSWER), z.array(z.string().max(2000)).max(LONGEST_LIST)])
          )
          .refine((values) => Object.keys(values).length <= SERVICE_FORM_MAX_FIELDS, "Campos demais."),
      })
    )
    .min(1)
    .max(50),
})

/**
 * Preenche (ou corrige) as informações de um pedido de serviço: o card de
 * Meus Pedidos e a janela pós-compra. A posse é conferida no repositório, no
 * próprio UPDATE.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Modo somente-leitura da impersonation (ver proxy.ts): responder pelo
  // cliente no chamado dele é escrita em nome de outra pessoa.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível preencher as informações do pedido.",
      },
      { status: 403 }
    )
  }

  // Por usuário, não por IP: impede enumerar ids de pedido numa conta válida.
  const { allowed } = await checkRateLimit({
    action: "order_service_form_submit",
    identifier: `${user.id}:${getClientIdentifier(request)}`,
    maxAttempts: 20,
    windowSeconds: 600,
    onError: "closed",
  })
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Informações do pedido inválidas." }, { status: 400 })
  }

  const result = await submitOrderServiceForm(id, user.id, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
