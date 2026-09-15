import "server-only"

import { createServerClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import type { Database } from "@/lib/database.types"
import { IMPERSONATION_ORIGIN_COOKIE } from "@/lib/impersonation-shared"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

/**
 * Troca do `code` dos callbacks de escopo extra (app/auth/discord/callback e
 * app/auth/youtube/callback) SEM mexer na sessão do navegador.
 *
 * O `exchangeCodeForSession` do cliente normal grava a sessão resultante nos
 * cookies. Quando o OAuth voltava com OUTRA conta (Discord sem conta no site,
 * ou a pessoa autorizou uma conta diferente na tela do provedor), a sessão do
 * navegador passava para essa conta e a recompensa caía nela. Em 14/09/2026
 * havia 8 contas Discord sem perfil criadas assim, 3 com a conquista.
 *
 * Aqui:
 * 1. A conta logada é lida ANTES, pelo cliente normal.
 * 2. O `code` é trocado num cliente que só enxerga o cookie do PKCE
 *    (`-code-verifier`) e descarta o que tentaria gravar. Ele nem vê a sessão
 *    atual, então também não tem como renová-la ou encerrá-la por engano.
 * 3. A sessão nova é revogada na hora: o navegador continua com a sessão que
 *    já tinha (inclusive em aal2, sem pedir o 2FA de novo). Só o
 *    `provider_token` interessa.
 * 4. Se a conta do OAuth não é a logada, nada é creditado. Se ela acabou de
 *    ser criada por este OAuth (só essa identidade, sem perfil), é apagada,
 *    para a conta social ficar livre para vincular no perfil certo.
 */

export type ScopedOAuthExchangeResult =
  | {
      ok: true
      userId: string
      providerToken: string | null
      /** Id da conta no provedor (`identity.id`, o `sub`), nunca `identity_id`. */
      providerAccountId: string | null
    }
  | {
      ok: false
      reason: "login_required" | "wrong_account" | "account_in_use" | "rate_limited" | "read_only" | "error"
    }

/**
 * Janela em que uma conta sem perfil é tratada como recém-criada pelo próprio
 * OAuth. O GoTrue cria a conta segundos antes do redirect para o callback;
 * 10 minutos só dão folga para uma rede lenta.
 */
const GHOST_ACCOUNT_MAX_AGE_MS = 10 * 60 * 1000

export async function exchangeScopedOAuthCode(params: {
  code: string
  provider: "discord" | "google"
  requestHeaders: Headers
}): Promise<ScopedOAuthExchangeResult> {
  // Mesma cota do /auth/callback: a troca é uma ida à rede do Supabase e o
  // sucesso ainda consulta a API do provedor.
  const rateLimit = await checkRateLimit({
    action: "scoped_oauth_callback",
    identifier: getClientIdentifierFromHeaders(params.requestHeaders),
    maxAttempts: 20,
    windowSeconds: 300,
    onError: "open",
  })
  if (!rateLimit.allowed) {
    return { ok: false, reason: "rate_limited" }
  }

  const supabase = await createSupabaseServerClient()
  const { data: currentAuth } = await supabase.auth.getUser()
  const currentUserId = currentAuth.user?.id ?? null

  const cookieStore = await cookies()
  const exchangeClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().filter((cookie) => cookie.name.includes("-code-verifier"))
        },
        setAll() {
          // Descartado de propósito: ver o passo 2 no topo do arquivo.
        },
      },
    }
  )

  const { data, error } = await exchangeClient.auth.exchangeCodeForSession(params.code)
  if (error || !data.session || !data.user) {
    console.error(
      `[scoped-oauth-exchange:${params.provider}] exchangeCodeForSession falhou:`,
      error?.code,
      error?.message
    )
    return { ok: false, reason: "error" }
  }

  const admin = createSupabaseAdminClient()

  // `local` revoga só a sessão deste token, não as outras da conta.
  const { error: revokeError } = await admin.auth.admin.signOut(data.session.access_token, "local")
  if (revokeError) {
    console.error(`[scoped-oauth-exchange:${params.provider}] falha ao revogar a sessão extra:`, revokeError.message)
  }

  if (currentUserId && data.user.id === currentUserId) {
    // Sessão de acesso (WEB MASTER navegando como o usuário) é somente leitura,
    // mas o proxy só barra método de escrita e este callback é um GET que grava
    // conquista e credita Aura. Mesmo sinal que o proxy usa.
    if (cookieStore.get(IMPERSONATION_ORIGIN_COOKIE)?.value) {
      return { ok: false, reason: "read_only" }
    }

    // A conta pode ter duas identidades do mesmo provedor (o GoTrue vincula
    // sozinho uma segunda conta com o mesmo e-mail verificado). A que acabou
    // de autorizar é a de `last_sign_in_at` mais recente, e é dela o token.
    const providerIdentity = (data.user.identities ?? [])
      .filter((identity) => identity.provider === params.provider)
      .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))[0]

    return {
      ok: true,
      userId: currentUserId,
      providerToken: data.session.provider_token ?? null,
      providerAccountId: providerIdentity?.id ?? null,
    }
  }

  const removedGhost = await removeAccountCreatedByThisOAuth(data.user, params.provider)
  console.error(
    `[scoped-oauth-exchange:${params.provider}] OAuth voltou com outra conta; nada foi creditado.`,
    { expected: currentUserId, received: data.user.id, removedGhost }
  )

  if (!currentUserId) return { ok: false, reason: "login_required" }
  return { ok: false, reason: removedGhost ? "wrong_account" : "account_in_use" }
}

/**
 * Apaga a conta que o GoTrue criou agora há pouco por causa deste OAuth.
 * Só age quando TODAS as condições valem: criada dentro da janela, a única
 * identidade é a deste provedor e não existe `user_profiles` (quem entra pelo
 * login normal sempre ganha perfil no /auth/callback). Qualquer dúvida, não
 * apaga.
 */
async function removeAccountCreatedByThisOAuth(user: User, provider: "discord" | "google"): Promise<boolean> {
  const identities = user.identities ?? []
  const createdAt = Date.parse(user.created_at)
  const isFresh = Number.isFinite(createdAt) && Date.now() - createdAt < GHOST_ACCOUNT_MAX_AGE_MS

  if (!isFresh || identities.length !== 1 || identities[0].provider !== provider) {
    return false
  }

  const admin = createSupabaseAdminClient()
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || profile) return false

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error(`[scoped-oauth-exchange:${provider}] falha ao apagar a conta criada pelo OAuth:`, error.message)
    return false
  }
  return true
}
