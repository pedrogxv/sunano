import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, refundRateLimitAttempt } from "@/lib/server/rate-limit"
import { isOwnedSupportImageUrl, MAX_SUPPORT_IMAGES_PER_MESSAGE } from "@/lib/server/support-media"
import { createSupportTicket, listMySupportTickets } from "@/lib/server/repositories/support-repository"
import { getUserProfile } from "@/lib/server/repositories/users-repository"

/** Lista/cria os tickets de suporte do usuário logado — "Meus Tickets" e o formulário de abertura em /suporte. */

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const page = Number(url.searchParams.get("page")) || 1
  const pageSize = Number(url.searchParams.get("pageSize")) || 20

  const { tickets, total, hasMore } = await listMySupportTickets(user.id, page, pageSize)
  return NextResponse.json({ tickets, total, hasMore })
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(3, "Assunto deve ter ao menos 3 caracteres").max(140),
  body: z.string().trim().min(1, "Mensagem não pode ficar vazia").max(4000),
  orderId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  imageUrls: z.array(z.string().url()).max(MAX_SUPPORT_IMAGES_PER_MESSAGE).optional(),
})

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "support_ticket_create",
    identifier: user.id,
    maxAttempts: 5,
    windowSeconds: 86400,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Você atingiu o limite de chamados abertos hoje. Tente novamente amanhã." },
      { status: 429 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = createTicketSchema.safeParse(json)
  if (!parsed.success) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const imageUrls = parsed.data.imageUrls ?? []
  if (imageUrls.some((url) => !isOwnedSupportImageUrl(url, user.id))) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: "Anexo inválido." }, { status: 400 })
  }

  const profile = await getUserProfile(user.id)
  const authorName = profile?.display_name?.trim() || user.email || "Usuário"

  const result = await createSupportTicket({
    userId: user.id,
    authorName,
    subject: parsed.data.subject,
    body: parsed.data.body,
    orderId: parsed.data.orderId ?? null,
    productId: parsed.data.productId ?? null,
    imageUrls,
  })

  if (!result.ok) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, ticketId: result.ticketId })
}
