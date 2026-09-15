"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { LGPD_POLICY_VERSION } from "@/lib/lgpd"
import { isImpersonatingFromCookies } from "@/lib/server/auth/current-user"
import { isFreshSocialAccount } from "@/lib/server/auth/fresh-social-account"
import {
  deleteUserAccountData,
  hasRecordedLgpdConsent,
  recordLgpdConsent,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export type ConsentState = { error: string | null }

async function getClientIp(): Promise<string | null> {
  const headersList = await headers()
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null
  )
}

/** Registra o aceite da Política de Privacidade e segue para `next`. */
export async function acceptLgpdConsentAction(
  _: ConsentState,
  formData: FormData
): Promise<ConsentState> {
  const next = sanitizeNextPath(String(formData.get("next") || ""))
  const accepted = formData.get("lgpd_consent") === "on"

  if (!accepted) {
    return { error: "Você precisa aceitar a Política de Privacidade para continuar." }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  await recordLgpdConsent({ userId: user.id, version: LGPD_POLICY_VERSION, ipAddress: await getClientIp() })

  redirect(next)
}

/**
 * Apaga a conta social que acabou de nascer e ainda não consentiu. Mesmo
 * caminho da autoexclusão (app/api/profile/delete/route.ts): anonimiza,
 * remove o perfil com registro em audit_log e depois apaga no Supabase Auth,
 * o que solta a identidade do Google/Discord.
 */
async function discardFreshSocialAccount(userId: string): Promise<boolean> {
  try {
    await deleteUserAccountData(userId, { ipAddress: await getClientIp(), actorId: userId })
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId)
    if (error) {
      console.error("[consentimento] falha ao descartar conta social nova:", error.message)
      return false
    }
    return true
  } catch (error) {
    console.error("[consentimento] falha ao descartar conta social nova:", error)
    return false
  }
}

/**
 * Recusa: não dá pra usar a plataforma sem aceitar, então desconecta.
 *
 * Conta social recém-criada (ver lib/server/auth/fresh-social-account.ts) é
 * descartada em vez de só desconectada. Sem consentimento não há base para
 * guardar os dados dela, e deixá-la viva prende o Google/Discord a uma conta
 * que ninguém vai usar: é o caso de quem já tinha conta com outro e-mail e
 * entrou pelo Discord sem querer. Conta antiga continua só sendo desconectada.
 */
export async function declineLgpdConsentAction() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let discarded = false
  if (
    user &&
    isFreshSocialAccount(user) &&
    // Segunda trava da sessão de acesso (a primeira é o proxy): apagar conta
    // nunca pode sair de uma sessão somente leitura.
    !(await isImpersonatingFromCookies()) &&
    !(await hasRecordedLgpdConsent(user.id))
  ) {
    discarded = await discardFreshSocialAccount(user.id)
  }

  // Depois do deleteUser a sessão já não existe no Supabase; o signOut ainda
  // apaga os cookies deste navegador.
  await supabase.auth.signOut()
  redirect(discarded ? "/login?discarded=1" : "/login")
}
