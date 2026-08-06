import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  deleteAllNotifications,
  listNotifications,
  markNotificationsRead,
  markNotificationsUnread,
} from "@/lib/server/repositories/notifications-repository"

export const dynamic = "force-dynamic"

/**
 * Notificações do usuário autenticado (mais recentes primeiro, paginadas por
 * `offset`/`limit`) + total de não lidas para o badge do sino.
 *
 * Deslogado responde 200 com lista vazia, não 401: o sino é renderizado no
 * TopBar de todas as páginas públicas, e um 401 a cada carga só encheria o
 * console de erro sem significar nada.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, notifications: [], unreadCount: 0, hasMore: false })
  }

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get("limit") ?? "") || undefined
  const offset = Number(searchParams.get("offset") ?? "") || undefined

  try {
    const { notifications, unreadCount, hasMore } = await listNotifications(user.id, {
      limit,
      offset,
    })
    return NextResponse.json({ ok: true, notifications, unreadCount, hasMore })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar notificações." }, { status: 500 })
  }
}

const markReadSchema = z.object({
  /** Ausente/vazio marca todas as do usuário (lidas ou não lidas, conforme `read`). */
  ids: z.array(z.string().uuid()).optional(),
  /** `false` desmarca (volta a não lida) em vez de marcar como lida. */
  read: z.boolean().optional(),
})

/** Marca notificações como lidas (ou não lidas, com `read: false`). */
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

    const { ids, read } = parsed.data
    if (read === false) {
      if (!ids || ids.length === 0) {
        return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
      }
      const updated = await markNotificationsUnread(user.id, ids)
      return NextResponse.json({ ok: true, updated })
    }

    const updated = await markNotificationsRead(user.id, ids)
    return NextResponse.json({ ok: true, updated })
  } catch {
    return NextResponse.json({ error: "Erro ao marcar como lida." }, { status: 500 })
  }
}

/** Apaga todas as notificações do usuário — botão "Limpar" do painel. */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
    }

    const deleted = await deleteAllNotifications(user.id)
    return NextResponse.json({ ok: true, deleted })
  } catch {
    return NextResponse.json({ error: "Erro ao limpar notificações." }, { status: 500 })
  }
}
