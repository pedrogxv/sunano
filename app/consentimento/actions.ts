"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { LGPD_POLICY_VERSION } from "@/lib/lgpd"
import { slugifyDisplayName, validateDisplayName } from "@/lib/profile-name"
import { isImpersonatingFromCookies } from "@/lib/server/auth/current-user"
import { isFreshSocialAccount } from "@/lib/server/auth/fresh-social-account"
import {
  deleteUserAccountData,
  getUserProfile,
  hasRecordedLgpdConsent,
  isDisplayNameAvailable,
  recordLgpdConsent,
  updateUserProfileSettings,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export type ConsentState = {
  error: string | null
  /** Erro do campo de nome: aparece embaixo dele, não no aviso geral. */
  nameError?: string | null
}

async function getClientIp(): Promise<string | null> {
  const headersList = await headers()
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null
  )
}

const NAME_TAKEN_MESSAGE = "Esse nome já está em uso. Escolha outro"

export type ConsentNameCheck = {
  /** `current`: é o nome que a conta já tem, nada a gravar. */
  state: "current" | "free" | "taken"
  message: string | null
}

/**
 * A troca de nome gratuita do /consentimento. O callback do OAuth deu à conta
 * o nome do Google/Discord (ou "nome2", se já estava em uso) sem perguntar
 * nada; aqui é a única vez em que ela escolhe, de graça e sem o cooldown de
 * `change_display_name_with_aura`, que só vale para quem já usa o site. Por
 * isso a mesma trava da recusa: conta social nova, sem consentimento e fora da
 * sessão de acesso. Depois do aceite, trocar volta a ser pago.
 *
 * Devolve o id e o nome atual, ou `null` quando a conta não pode escolher.
 */
async function getNameChoiceAccount(): Promise<{ userId: string; currentName: string } | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user ||
    !isFreshSocialAccount(user) ||
    (await isImpersonatingFromCookies()) ||
    (await hasRecordedLgpdConsent(user.id))
  ) {
    return null
  }
  const profile = await getUserProfile(user.id)
  return { userId: user.id, currentName: profile?.display_name ?? "" }
}

async function checkName(userId: string, currentName: string, name: string): Promise<ConsentNameCheck> {
  // Manter o nome que veio do provedor nunca é recusado: o callback já o
  // escolheu livre e válido, e revalidar faria a regra de agora (palavra
  // reservada nova, filtro) travar a entrada de quem só quer seguir
  if (slugifyDisplayName(name) === slugifyDisplayName(currentName)) {
    return { state: "current", message: null }
  }
  const invalid = validateDisplayName(name)
  if (invalid) return { state: "taken", message: invalid }
  if (!(await isDisplayNameAvailable(name, userId))) {
    return { state: "taken", message: NAME_TAKEN_MESSAGE }
  }
  return { state: "free", message: null }
}

/**
 * Disponibilidade do nome enquanto a pessoa digita. Server action, e não
 * `/api/profile/name-check`: com o consentimento pendente o proxy responde 403
 * a toda `/api/*`, e só o próprio /consentimento passa. Conveniência de UI; a
 * garantia é a checagem do aceite e o índice único do banco.
 */
export async function checkConsentDisplayNameAction(name: string): Promise<ConsentNameCheck | null> {
  const account = await getNameChoiceAccount()
  if (!account) return null
  return checkName(account.userId, account.currentName, String(name ?? "").trim())
}

/** Grava o nome escolhido. Devolve a mensagem de erro, ou `null`. */
async function applyChosenDisplayName(name: string): Promise<string | null> {
  const account = await getNameChoiceAccount()
  if (!account) return null

  const check = await checkName(account.userId, account.currentName, name)
  if (check.state === "current") return null
  if (check.state === "taken") return check.message ?? NAME_TAKEN_MESSAGE

  try {
    await updateUserProfileSettings(account.userId, { displayName: name })
  } catch (error) {
    // Corrida com outro cadastro no mesmo nome: o índice único de
    // `display_slug` recusa com 23505
    if ((error as { code?: string } | null)?.code === "23505") return NAME_TAKEN_MESSAGE
    console.error("[consentimento] falha ao gravar o nome escolhido:", error)
    return "Não foi possível salvar o nome agora. Tente de novo"
  }
  return null
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

  const chosenName = String(formData.get("display_name") ?? "").trim()
  if (chosenName) {
    const nameError = await applyChosenDisplayName(chosenName)
    if (nameError) return { error: null, nameError }
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
