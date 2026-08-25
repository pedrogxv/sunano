import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import { AuthBackground } from "@/components/auth/AuthBackground"
import { TwoFactorVerifyForm } from "@/components/auth/TwoFactorVerifyForm"
import { isMfaStepUpRequired, sanitizeNextPath, TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/auth-mfa"
import { isTrustedDevice } from "@/lib/server/repositories/mfa-trusted-devices-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = sanitizeNextPath(params.next)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem sessão não há o que verificar — volta ao login.
  if (!user) {
    redirect("/login")
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const stepUpRequired = isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })

  // Sessão já está em aal2 (ou não há 2FA): nada a fazer aqui.
  if (!stepUpRequired) {
    redirect(next)
  }

  // Dispositivo marcado como confiável (ver TwoFactorVerifyForm): dispensa o
  // código mesmo com a sessão ainda em aal1 — exceto indo para /reset-password,
  // onde a sessão é de recovery (criada agora pelo link de e-mail) e o GoTrue
  // recusa `updateUser` com 401 insufficient_aal mesmo em dispositivo confiável.
  const trustedToken = (await cookies()).get(TRUSTED_DEVICE_COOKIE_NAME)?.value
  if (next !== "/reset-password" && (await isTrustedDevice(user.id, trustedToken))) {
    redirect(next)
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Verificação em dois fatores
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta tem o 2FA ativo. Confirme o código do app autenticador para continuar.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <TwoFactorVerifyForm next={next} />
        </div>
      </div>
    </div>
  )
}
