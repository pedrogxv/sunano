import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  clearImpersonationCookies,
  readImpersonationOrigin,
} from "@/lib/server/impersonation"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const dynamic = "force-dynamic"

function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/**
 * Encerra a sessão "logado como" e devolve o admin à própria sessão.
 *
 * Não exige checagem de cargo: quem tem o cookie `imp-origin` cifrado
 * (emitido só pelo endpoint de start, que já validou WEB MASTER) é o único que
 * consegue chamar isto com efeito. Sem o cookie, é no-op.
 *
 * Também é chamado automaticamente pelo proxy quando o cookie expira.
 */
export async function POST(request: Request) {
  try {
    const origin = await readImpersonationOrigin()

    // Restaura os cookies sb-* do admin (ou, se o cookie expirou/sumiu, apenas
    // limpa a sessão impersonada — o admin terá que logar de novo).
    const store = await cookies()

    // Remove os cookies sb-* atuais (do alvo).
    for (const c of store.getAll()) {
      if (c.name.startsWith("sb-")) {
        store.set(c.name, "", { path: "/", expires: new Date(0) })
      }
    }

    if (origin) {
      for (const c of origin.adminCookies) {
        store.set(c.name, c.value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        })
      }

      const admin = createSupabaseAdminClient()
      await admin.from("audit_log").insert({
        user_id: origin.targetId,
        actor_id: origin.adminId,
        action: "impersonation_ended",
        table_name: "auth.users",
        record_id: origin.targetId,
        metadata: {
          reason: origin.reason,
          ticket: origin.ticket,
          admin_email: origin.adminEmail,
          target_email: origin.targetEmail,
          started_at: new Date(origin.startedAt).toISOString(),
          duration_ms: Date.now() - origin.startedAt,
        },
        ip_address: getClientIp(request),
      })
    }

    await clearImpersonationCookies()

    return NextResponse.json({ ok: true, restored: Boolean(origin), redirectTo: "/admin/users" })
  } catch {
    return NextResponse.json({ error: "Erro ao encerrar o acesso." }, { status: 500 })
  }
}
