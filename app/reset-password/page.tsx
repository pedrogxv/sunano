import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { AuthBackground } from "@/components/auth/AuthBackground"
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"
import { ConfirmRecoveryForm } from "@/components/auth/ConfirmRecoveryForm"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; code?: string }>
}) {
  const params = await searchParams
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem sessão ainda: se o link trouxe um token não consumido, pede o clique
  // explícito antes de verificar (ver confirmRecoveryAction). Só quando não
  // sobra nem sessão nem token é que o link realmente não presta mais.
  if (!user) {
    if (params.token_hash || params.code) {
      return (
        <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
          <AuthBackground />
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                Redefinir senha
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Confirme para continuar a redefinição da sua senha.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
              <ConfirmRecoveryForm tokenHash={params.token_hash} code={params.code} />
            </div>
          </div>
        </div>
      )
    }
    redirect("/forgot-password?expired=1")
  }

  // O link de recuperação por e-mail só eleva a sessão a aal1, nunca a aal2 —
  // o GoTrue recusa `updateUser({ password })` com 401 insufficient_aal para
  // quem tem 2FA ativo. Diferente do resto do site, aqui o step-up é exigido
  // mesmo em dispositivo marcado como confiável: é uma sessão de recovery
  // nova, não o login normal que esse cookie foi pensado para dispensar.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    redirect("/2fa?next=/reset-password")
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <AuthBackground />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Redefinir senha
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escolha uma nova senha para sua conta.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/30">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  )
}
