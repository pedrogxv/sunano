import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  getEventForAdmin,
  grantEventMedalToUser,
  searchGrantableUsers,
} from "@/lib/server/repositories/events-repository"

const grantSchema = z.object({
  userId: z.string().uuid(),
})

const GRANT_ERROR_MESSAGES: Record<"not_found" | "not_staff_grant" | "unavailable", string> = {
  not_found: "Conquista não encontrada.",
  not_staff_grant: "Essa conquista não é do tipo premiação da Staff.",
  unavailable: "As vagas dessa conquista acabaram.",
}

/** GET ?q= — busca candidatos a receber a medalha (exclui quem já tem). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await params
  const event = await getEventForAdmin(id)
  if (!event) {
    return NextResponse.json({ error: "Conquista não encontrada." }, { status: 404 })
  }

  const q = request.nextUrl.searchParams.get("q") ?? ""
  const candidates = await searchGrantableUsers(q, event.medalId)
  return NextResponse.json({ candidates })
}

/** POST { userId } — concede a medalha manualmente a um usuário específico. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = grantSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const { id } = await params
  const result = await grantEventMedalToUser(id, parsed.data.userId, auth.profile.id)
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 400
    return NextResponse.json({ error: GRANT_ERROR_MESSAGES[result.reason] }, { status })
  }

  return NextResponse.json({ ok: true, event: result.event })
}
