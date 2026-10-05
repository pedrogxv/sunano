import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { deleteTestimonial, updateTestimonial } from "@/lib/server/repositories/store-testimonials-repository"

import { storeTestimonialSchema } from "../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar depoimentos." }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = storeTestimonialSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const testimonial = await updateTestimonial(id, parsed.data)
    return NextResponse.json({ ok: true, testimonial })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao atualizar depoimento.")
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para remover depoimentos." }, { status: 403 })
  }

  const { id } = await context.params
  try {
    await deleteTestimonial(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao remover depoimento.")
    return NextResponse.json(body, { status })
  }
}
