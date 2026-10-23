import { NextResponse } from "next/server"

import { getAccountSummary } from "@/lib/server/repositories/account-summary-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

/** Retrato da conta do usuário logado — hero de /conta e /perfil (ver `lib/account-summary.ts`). */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const summary = await getAccountSummary(user.id)
  if (!summary) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } })
}
