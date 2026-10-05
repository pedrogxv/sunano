import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createTestimonial, listAllTestimonials } from "@/lib/server/repositories/store-testimonials-repository"

import { storeTestimonialSchema } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Lista todos os depoimentos (publicados ou não) para o painel. */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver depoimentos." }, { status: 403 })
  }

  try {
    return NextResponse.json({ testimonials: await listAllTestimonials() })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar depoimentos.")
    return NextResponse.json(body, { status })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para criar depoimentos." }, { status: 403 })
  }

  const parsed = storeTestimonialSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const testimonial = await createTestimonial(parsed.data)
    return NextResponse.json({ ok: true, testimonial }, { status: 201 })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao criar depoimento.")
    return NextResponse.json(body, { status })
  }
}
