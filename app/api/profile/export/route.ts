import { NextResponse } from "next/server"

import { getUserDataExport } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

// GET /api/profile/export — Portabilidade de dados (LGPD Art. 18, V)
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const exportData = await getUserDataExport(authData.user.id, authData.user.email ?? null)

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="meus-dados-sunano-${new Date().toISOString().split("T")[0]}.json"`,
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao exportar dados." }, { status: 500 })
  }
}
