import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { deleteNotification } from "@/lib/server/repositories/notifications-repository"

export const dynamic = "force-dynamic"

/** Dispensa (apaga) uma notificação do próprio usuário. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
    }

    const { id } = await context.params
    await deleteNotification(user.id, id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao remover notificação." }, { status: 500 })
  }
}
