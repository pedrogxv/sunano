import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { replaceProductPeripherals } from "@/lib/server/repositories/store-repository"
import { peripheralsExist } from "@/lib/server/repositories/peripherals-repository"

const peripheralsSchema = z.object({
  peripheral_ids: z.array(z.string().uuid()).max(40),
})

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = peripheralsSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const peripheralIds = [...new Set(parsed.data.peripheral_ids)]

  const exist = await peripheralsExist(peripheralIds)
  if (!exist) {
    return NextResponse.json({ error: "Um ou mais periféricos selecionados não existem." }, { status: 400 })
  }

  try {
    await replaceProductPeripherals(id, peripheralIds)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar periféricos vinculados."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
