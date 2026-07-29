"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { LGPD_POLICY_VERSION } from "@/lib/lgpd"
import { recordLgpdConsent } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export type ConsentState = { error: string | null }

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

  const headersList = await headers()
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null

  await recordLgpdConsent({ userId: user.id, version: LGPD_POLICY_VERSION, ipAddress })

  redirect(next)
}

/** Recusa: não dá pra usar a plataforma sem aceitar, então só desconecta. */
export async function declineLgpdConsentAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
