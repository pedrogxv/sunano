import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  addPeripheralReview,
  deleteOwnPeripheralReview,
  updateOwnPeripheralReview,
} from "@/lib/server/repositories/peripheral-reviews-repository"

/**
 * Review é um recurso singleton por `(user, peripheral)` (constraint unique
 * em `peripheral_reviews`) — o `peripheralId` na URL já identifica a review
 * do usuário autenticado, sem precisar de um segundo segmento de id (diferente
 * de `/comments`, que permite N comentários por periférico).
 */

const ratingSchema = z
  .number()
  .min(1)
  .max(5)
  .refine((v) => Number.isInteger(v * 2), { message: "Nota deve estar em passos de meia estrela." })

const bodySchema = z.string().trim().max(400).nullable().optional()

const createSchema = z.object({ rating: ratingSchema, body: bodySchema })
const updateSchema = z
  .object({ rating: ratingSchema.optional(), body: bodySchema })
  .refine((d) => d.rating !== undefined || d.body !== undefined, { message: "Nada para atualizar." })

/** Cria a review do usuário atual pra este periférico. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para avaliar." }, { status: 401 })
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      action: "peripheral_review_create",
      identifier: user.id,
      maxAttempts: 20,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você avaliou periféricos muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await addPeripheralReview({
      peripheralId: id,
      userId: user.id,
      rating: parsed.data.rating,
      body: parsed.data.body?.trim() || null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, review: result.review })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar sua avaliação." }, { status: 500 })
  }
}

/** Edita a review do usuário atual pra este periférico. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para editar sua avaliação." }, { status: 401 })
    }

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      action: "peripheral_review_edit",
      identifier: user.id,
      maxAttempts: 30,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você editou avaliações muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await updateOwnPeripheralReview({
      peripheralId: id,
      userId: user.id,
      rating: parsed.data.rating,
      body: parsed.data.body !== undefined ? parsed.data.body?.trim() || null : undefined,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, review: result.review })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar sua avaliação." }, { status: 500 })
  }
}

/** Exclui a review do usuário atual pra este periférico. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para excluir sua avaliação." }, { status: 401 })
    }

    const rateLimit = await checkRateLimit({
      action: "peripheral_review_delete",
      identifier: user.id,
      maxAttempts: 30,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você excluiu avaliações muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await deleteOwnPeripheralReview({ peripheralId: id, userId: user.id })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao excluir sua avaliação." }, { status: 500 })
  }
}
