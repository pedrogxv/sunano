import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getMySupportTicket } from "@/lib/server/repositories/support-repository"

/** Detalhe + thread de um ticket do usuário logado. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const { id } = await params
  const result = await getMySupportTicket(id, user.id)
  if (!result) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 })
  }

  return NextResponse.json(result)
}
