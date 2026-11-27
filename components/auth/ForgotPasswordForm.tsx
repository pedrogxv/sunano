"use client"

import { useActionState } from "react"
import { ArrowLeft } from "lucide-react"

import { forgotPasswordAction } from "@/app/forgot-password/actions"
import { AuthAlert, AuthField, AuthInput, AuthSubmitButton } from "@/components/auth/auth-form-ui"
import { TurnstileField, useTurnstile } from "@/components/auth/TurnstileWidget"

const initialState = { error: null as string | null, success: false }

/**
 * Pedido de link de redefinição. O mesmo form na página /forgot-password e
 * dentro do login (página e modal) — ali com `onBack`, que mostra o "Voltar
 * ao login" e o cabeçalho próprio, já que não há página em volta.
 */
export function ForgotPasswordForm({ onBack }: { onBack?: () => void } = {}) {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState)
  const captcha = useTurnstile()

  function submit(formData: FormData) {
    captcha.rotate()
    formAction(formData)
  }

  const back = onBack && (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Voltar ao login
    </button>
  )

  if (state.success) {
    return (
      <div className="space-y-4">
        <AuthAlert tone="success">
          Se o email estiver cadastrado, você vai receber em instantes um link para criar uma nova senha
        </AuthAlert>
        {back}
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
      {onBack && (
        <div>
          <p className="text-sm font-semibold text-foreground">Redefinir a senha</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Informe o email da conta e enviamos um link para criar uma nova senha
          </p>
        </div>
      )}

      <form action={submit} className="space-y-4">
        <AuthField id="forgot-email" label="Email">
          <AuthInput
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            required
            autoFocus={Boolean(onBack)}
          />
        </AuthField>

        <TurnstileField captcha={captcha} />

        {state.error && <AuthAlert>{state.error}</AuthAlert>}

        <AuthSubmitButton pendingLabel="Enviando…" disabled={captcha.blocked}>
          Enviar link de redefinição
        </AuthSubmitButton>
      </form>

      {back}
    </div>
  )
}
