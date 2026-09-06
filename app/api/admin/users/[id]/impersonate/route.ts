import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import * as z from "zod"

import { type AdminProfile, isWebMaster } from "@/lib/admin-permissions"
import {
  IMPERSONATION_TTL_MS,
  readImpersonationOrigin,
  writeImpersonationOrigin,
  type StoredCookie,
} from "@/lib/server/impersonation"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  // Finalidade (LGPD Art. 6º, I) — obrigatória e gravada no audit_log.
  reason: z.string().trim().min(10, "Descreva o motivo (mín. 10 caracteres).").max(500),
  ticket: z.string().trim().max(80).optional(),
})

function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/** Todos os cookies `sb-*` da requisição — a sessão do @supabase/ssr. */
async function currentSupabaseCookies(): Promise<StoredCookie[]> {
  const store = await cookies()
  return store
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => ({ name: c.name, value: c.value }))
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: targetId } = await params
    if (!z.string().uuid().safeParse(targetId).success) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    // Já dentro de uma sessão impersonada não se inicia outra (o cookie sb-*
    // atual seria do usuário-alvo, não do admin — encerrar antes).
    if (await readImpersonationOrigin()) {
      return NextResponse.json(
        { error: "Já existe uma sessão de acesso ativa. Encerre-a antes de iniciar outra." },
        { status: 409 }
      )
    }

    const { data: currentProfile } = await supabase
      .from("admin_profiles")
      .select("id, email, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()
    const typedCurrent = currentProfile as AdminProfile | null

    if (!typedCurrent || !isWebMaster(typedCurrent)) {
      return NextResponse.json(
        { error: "Apenas o WEB Master pode acessar contas de usuários." },
        { status: 403 }
      )
    }

    if (targetId === authData.user.id) {
      return NextResponse.json({ error: "Você não pode acessar a própria conta." }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()

    // Alvo precisa existir e ser usuário COMUM. Nunca impersonar quem tem
    // qualquer cargo administrativo — não há caso de suporte para isso e
    // evita escalada lateral de privilégio.
    const { data: targetAuth } = await admin.auth.admin.getUserById(targetId)
    if (!targetAuth?.user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
    }
    const targetEmail = targetAuth.user.email ?? null

    const { data: targetAdminRow } = await admin
      .from("admin_profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle()
    if (targetAdminRow) {
      return NextResponse.json(
        { error: "Contas com cargo administrativo não podem ser acessadas por este recurso." },
        { status: 403 }
      )
    }

    // Conta banida: acessar não tem finalidade de suporte legítima e a
    // sessão seria expulsa pelo próprio proxy no primeiro request.
    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("account_banned_at")
      .eq("id", targetId)
      .maybeSingle()
    if (targetProfile?.account_banned_at) {
      return NextResponse.json(
        { error: "Não é possível acessar uma conta banida." },
        { status: 409 }
      )
    }

    if (!targetEmail) {
      return NextResponse.json(
        { error: "Usuário sem e-mail — não é possível emitir sessão." },
        { status: 422 }
      )
    }

    const startedAt = Date.now()
    const ipAddress = getClientIp(request)

    // ── Registro de auditoria ANTES de trocar a sessão (LGPD Art. 37) ──
    await admin.from("audit_log").insert({
      user_id: targetId,
      actor_id: authData.user.id,
      action: "impersonation_started",
      table_name: "auth.users",
      record_id: targetId,
      metadata: {
        reason: parsed.data.reason,
        ticket: parsed.data.ticket ?? null,
        admin_email: typedCurrent.email ?? authData.user.email ?? null,
        target_email: targetEmail,
        expires_at: new Date(startedAt + IMPERSONATION_TTL_MS).toISOString(),
        scope: "read_only",
      },
      ip_address: ipAddress,
    })

    // Guarda a sessão do admin ANTES de sobrescrever os cookies sb-*.
    const adminCookies = await currentSupabaseCookies()

    // ── Emite uma sessão real do alvo ──
    // generateLink não envia e-mail nenhum; devolve o hashed_token do OTP, que
    // trocamos por uma sessão via verifyOtp usando o mesmo client server (que
    // grava os cookies sb-* no response).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    })
    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json(
        { error: "Falha ao emitir sessão do usuário." },
        { status: 502 }
      )
    }

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    })
    if (verifyErr) {
      return NextResponse.json(
        { error: "Falha ao iniciar a sessão do usuário." },
        { status: 502 }
      )
    }

    // Agora os cookies sb-* já são do alvo. Persiste a origem assinada para o
    // /stop conseguir voltar.
    await writeImpersonationOrigin({
      adminId: authData.user.id,
      adminEmail: typedCurrent.email ?? authData.user.email ?? null,
      targetId,
      targetEmail,
      reason: parsed.data.reason,
      ticket: parsed.data.ticket ?? null,
      startedAt,
      adminCookies,
    })

    return NextResponse.json({
      ok: true,
      target: { id: targetId, email: targetEmail },
      expiresAt: startedAt + IMPERSONATION_TTL_MS,
      redirectTo: "/",
    })
  } catch {
    return NextResponse.json({ error: "Erro ao iniciar o acesso." }, { status: 500 })
  }
}
