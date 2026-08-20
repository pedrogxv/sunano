import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, refundRateLimitAttempt } from "@/lib/server/rate-limit"
import { isOwnedSupportImageUrl, MAX_SUPPORT_IMAGES_PER_MESSAGE } from "@/lib/server/support-media"
import { postUserSupportMessage } from "@/lib/server/repositories/support-repository"
import { getUserProfile } from "@/lib/server/repositories/users-repository"

/**
 * Nova mensagem do usuário numa conversa existente. A regra "só 1 mensagem
 * pendente por vez" é imposta pela trigger do banco (ver
 * enforce_support_message_turn em 20260921000016_support_tickets.sql) — o
 * repositório traduz a violação para status 409.
 */
const createMessageSchema = z.object({
  body: z.string().trim().min(1, "Mensagem não pode ficar vazia").max(4000),
  imageUrls: z.array(z.string().url()).max(MAX_SUPPORT_IMAGES_PER_MESSAGE).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "support_message_create",
    identifier: user.id,
    maxAttempts: 30,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas mensagens seguidas. Aguarde um instante." }, { status: 429 })
  }

  const json = await request.json().catch(() => null)
  const parsed = createMessageSchema.safeParse(json)
  if (!parsed.success) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const imageUrls = parsed.data.imageUrls ?? []
  if (imageUrls.some((url) => !isOwnedSupportImageUrl(url, user.id))) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: "Anexo inválido." }, { status: 400 })
  }

  const { id } = await params
  const profile = await getUserProfile(user.id)
  const authorName = profile?.display_name?.trim() || user.email || "Usuário"

  const result = await postUserSupportMessage({
    ticketId: id,
    userId: user.id,
    authorName,
    body: parsed.data.body,
    imageUrls,
  })

  if (!result.ok) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
