import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  getPeripheralRequestForAdmin,
  reviewPeripheralRequest,
  REVIEW_STATUSES,
} from "@/lib/server/repositories/peripheral-requests-repository"
import { PERIPHERAL_REQUEST_LIMITS } from "@/lib/peripheral-requests"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "peripherals_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const { id } = await params
  const detail = await getPeripheralRequestForAdmin(id)
  if (!detail) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, request: detail })
}

const reviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES as [string, ...string[]], { message: "Status inválido." }),
  response: z
    .string()
    .trim()
    .max(PERIPHERAL_REQUEST_LIMITS.response, `A resposta deve ter no máximo ${PERIPHERAL_REQUEST_LIMITS.response} caracteres.`)
    .nullish(),
  peripheralId: z.string().uuid("Ficha inválida.").nullish(),
})

/** Muda o status do pedido (e responde à pessoa). O aviso no sino sai de um trigger no banco. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = reviewSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const { id } = await params
  const result = await reviewPeripheralRequest({
    id,
    adminId: auth.profile.id,
    status: parsed.data.status as (typeof REVIEW_STATUSES)[number],
    response: parsed.data.response || null,
    peripheralId: parsed.data.peripheralId ?? null,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
