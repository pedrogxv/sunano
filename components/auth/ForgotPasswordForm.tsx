"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { forgotPasswordAction } from "@/app/forgot-password/actions"
import { TurnstileWidget } from "@/components/auth/TurnstileWidget"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const initialState = { error: null as string | null, success: false }

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending || disabled} type="submit">
      {pending ? "Enviando…" : "Enviar link de redefinição"}
    </Button>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  // O token do Turnstile é de uso único e já foi lido para o FormData neste ponto: o widget remonta para a próxima tentativa.
  function submitWithFreshCaptcha(formData: FormData) {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
    formAction(formData)
  }

  if (state.success) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-600 dark:text-green-400">
        Email enviado! Verifique sua caixa de entrada e clique no link para redefinir sua senha.
      </div>
    )
  }

  return (
    <form action={submitWithFreshCaptcha} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="email">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          className="border-border bg-muted/20"
          required
        />
      </div>

      <TurnstileWidget key={captchaKey} onTokenChange={setCaptchaToken} />
      <input type="hidden" name="cf_turnstile_response" value={captchaToken ?? ""} />

      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <SubmitButton disabled={Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !captchaToken} />
    </form>
  )
}
