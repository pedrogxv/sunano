import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  listNotifications,
  markNotificationsRead,
} from "@/lib/server/repositories/notifications-repository"

export const dynamic = "force-dynamic"

/**
 * Notificações do usuário autenticado (mais recentes primeiro) + total de não
 * lidas para o badge do sino.
 *
 * Deslogado responde 200 com lista vazia, não 401: o sino é renderizado no
 * TopBar de todas as páginas públicas, e um 401 a cada carga só encheria o
 * console de erro sem significar nada.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, notifications: [], unreadCount: 0 })
  }

  try {
    const { notifications, unreadCount } = await listNotifications(user.id)
    return NextResponse.json({ ok: true, notifications, unreadCount })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar notificações." }, { status: 500 })
  }
}

const markReadSchema = z.object({
  /** Ausente/vazio marca todas as não lidas do usuário. */
  ids: z.array(z.string().uuid()).optional(),
})

/** Marca notificações como lidas. */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
    }

    const parsed = markReadSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
    }

    const updated = await markNotificationsRead(user.id, parsed.data.ids)
    return NextResponse.json({ ok: true, updated })
  } catch {
    return NextResponse.json({ error: "Erro ao marcar como lida." }, { status: 500 })
  }
}
