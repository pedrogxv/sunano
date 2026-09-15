import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getEventForAdmin, listEventRecipients } from "@/lib/server/repositories/events-repository"

/** GET — lista quem já recebeu a medalha de uma conquista `staff_grant`. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const recipients = await listEventRecipients(event.medalId)
  return NextResponse.json({ recipients })
}
