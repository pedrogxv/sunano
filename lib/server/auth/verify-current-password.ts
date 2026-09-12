import "server-only"

import { createClient } from "@supabase/supabase-js"

import { checkRateLimit } from "@/lib/server/rate-limit"

export type VerifyCurrentPasswordResult =
  | { ok: true }
  | { ok: false; error: string; status: 401 | 429 | 500 }

/**
 * Confere a senha atual de quem já está logado, sem tocar na sessão dele.
 *
 * Reautenticar com `signInWithPassword` no client da própria sessão (como a
 * rota de Conta fazia) substitui os cookies por uma sessão nova de nível
 * `aal1`: para quem tem 2FA isso derrubava o nível da sessão e o
 * `updateUser` seguinte falhava. Aqui a conferência roda num client
 * descartável, sem persistência, e a sessão que ele abre é encerrada logo em
 * seguida.
 *
 * O teto por usuário existe porque esta conferência é, por definição, um
 * oráculo de senha para quem segura a sessão: sem ele, um cookie roubado
 * permitia testar senhas à vontade até achar a atual.
 */
export async function verifyCurrentPassword(
  userId: string,
  email: string,
  password: string
): Promise<VerifyCurrentPasswordResult> {
  const limit = await checkRateLimit({
    action: "current_password_check",
    identifier: userId,
    maxAttempts: 5,
    windowSeconds: 900,
    onError: "closed",
  })
  if (!limit.allowed) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.", status: 429 }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return { ok: false, error: "Erro ao conferir a senha.", status: 500 }
  }

  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error } = await verifier.auth.signInWithPassword({ email, password })
  if (error) {
    return { ok: false, error: "Senha atual incorreta.", status: 401 }
  }

  // Encerra só a sessão aberta pela conferência; as outras sessões da pessoa
  // (inclusive a atual) seguem valendo.
  await verifier.auth.signOut({ scope: "local" }).catch(() => {})
  return { ok: true }
}
