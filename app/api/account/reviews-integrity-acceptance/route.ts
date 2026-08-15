import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { acceptReviewsIntegrityTerm } from "@/lib/server/repositories/users-repository"

/** Registra o aceite do termo de integridade das mini reviews (item 1.2) — idempotente, sem corpo. */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
    }

    const acceptedAt = await acceptReviewsIntegrityTerm(user.id)
    return NextResponse.json({ ok: true, acceptedAt })
  } catch {
    return NextResponse.json({ error: "Erro ao registrar o aceite." }, { status: 500 })
  }
}
