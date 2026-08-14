import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { isWebMaster } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  broadcastSystemNotification,
  listNotificationTargets,
  listSentSystemNotices,
} from "@/lib/server/repositories/notifications-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Avisos do sistema. Restrito a webmaster e não a uma permissão nova: um
 * broadcast chega a TODOS os usuários de uma vez e não tem desfazer útil
 * (dá para apagar as linhas, mas quem já leu já leu). É o mesmo critério
 * de `/admin/users`.
 */
async function requireWebmaster() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return { error: auth.error ?? "Não autorizado.", status: auth.status }
  }
  if (!isWebMaster(auth.profile)) {
    return { error: "Apenas webmasters podem enviar avisos do sistema.", status: 403 as const }
  }
  return null
}

/** Histórico de envios + lista de usuários para o envio individual. */
export async function GET() {
  const denied = await requireWebmaster()
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  try {
    const [sent, targets] = await Promise.all([listSentSystemNotices(), listNotificationTargets()])
    return NextResponse.json({ sent, targets })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao carregar avisos.")
    return NextResponse.json(body, { status })
  }
}

const sendSchema = z.object({
  title: z.string().trim().min(1, "Escreva um título.").max(80, "Título muito longo (máx. 80)."),
  body: z.string().trim().min(1, "Escreva a mensagem.").max(120, "Mensagem muito longa (máx. 120)."),
  // Caminho interno do próprio site — link externo aqui viraria vetor de
  // phishing dentro de uma notificação que o usuário confia por ser "do sistema".
  link: z
    .string()
    .trim()
    .regex(/^\/[\w\-/]*$/, "O link deve ser um caminho interno, começando com /.")
    .max(200)
    .optional()
    .or(z.literal("")),
  /** Ausente = broadcast para todo mundo. */
  userId: z.string().uuid().optional().or(z.literal("")),
})

/** Envia o aviso. Sem `userId`, vai para todos os usuários. */
export async function POST(request: NextRequest) {
  const denied = await requireWebmaster()
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const parsed = sendSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const sentTo = await broadcastSystemNotification({
      title: parsed.data.title,
      body: parsed.data.body,
      link: parsed.data.link || null,
      userId: parsed.data.userId || null,
    })
    return NextResponse.json({ ok: true, sentTo })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao enviar aviso.")
    return NextResponse.json(body, { status })
  }
}
