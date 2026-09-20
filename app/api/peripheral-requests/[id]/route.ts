import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getMyPeripheralRequest } from "@/lib/server/repositories/peripheral-requests-repository"

/** Detalhe de um pedido da pessoa logada. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const { id } = await params
  const detail = await getMyPeripheralRequest(id, user.id)
  if (!detail) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  }

  return NextResponse.json({ request: detail })
}
