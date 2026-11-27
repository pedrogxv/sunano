"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"

import { loginUserAction } from "@/app/login/actions"
import {
  AuthAlert,
  AuthDivider,
  AuthField,
  AuthInput,
  AuthPasswordInput,
  AuthSubmitButton,
  AuthSwitchPrompt,
  AuthTextLink,
} from "@/components/auth/auth-form-ui"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"
import { OAuthButtons } from "@/components/auth/OAuthButton"
import { TurnstileField, useTurnstile } from "@/components/auth/TurnstileWidget"
import { useAuthUser } from "@/components/providers/auth-context"

const LOGIN_ERRORS: Record<string, string> = {
  missing_credentials: "Informe email e senha.",
  invalid_credentials: "Email ou senha incorretos.",
  too_many_attempts: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  account_banned: "Conta suspensa ou banida.",
  captcha_failed: "Não foi possível confirmar que você não é um robô. Tente novamente.",
}

interface UserLoginFormProps {
  /**
   * Quando usado dentro do AuthModal: envia `skip_redirect` para a action (o
   * modal fica na página atual em vez de navegar) e troca os links `<Link
   * href="/register">` por callbacks que trocam de aba dentro do próprio
   * modal, sem navegação.
   */
  embedded?: boolean
  next?: string
  onSuccess?: (mfaNext?: string) => void
  onSwitchToRegister?: () => void
}

export function UserLoginForm({ embedded = false, next = "/forum", onSuccess, onSwitchToRegister }: UserLoginFormProps = {}) {
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [loginState, loginAction] = useActionState(loginUserAction, { error: null })
  const captcha = useTurnstile()
  const { refresh } = useAuthUser()

  useEffect(() => {
    if (embedded && loginState.success) {
      refresh()
      onSuccess?.(loginState.mfaNext)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginState])

  function submit(formData: FormData) {
    captcha.rotate()
    loginAction(formData)
  }

  const errorMessage = loginState.error ? (LOGIN_ERRORS[loginState.error] ?? loginState.error) : null

  if (mode === "forgot") {
    return <ForgotPasswordForm onBack={() => setMode("login")} />
  }

  return (
    <div className="space-y-5">
      <OAuthButtons intent="login" next={next} />

      <AuthDivider label="ou com email" />

      <form action={submit} className="space-y-4">
        {embedded && <input type="hidden" name="skip_redirect" value="1" />}
        <AuthField id="email" label="Email">
          <AuthInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            required
          />
        </AuthField>

        <AuthField
          id="password"
          label="Senha"
          aside={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setMode("forgot")}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Esqueceu a senha?
            </button>
          }
        >
          <AuthPasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            required
          />
        </AuthField>

        <TurnstileField captcha={captcha} error={loginState.error === "captcha_failed"} />

        {errorMessage && <AuthAlert>{errorMessage}</AuthAlert>}

        <AuthSubmitButton pendingLabel="Entrando…" disabled={captcha.blocked}>
          Entrar
        </AuthSubmitButton>
      </form>

      <AuthSwitchPrompt>
        Não tem conta?{" "}
        <AuthTextLink href="/register" onClick={embedded ? onSwitchToRegister : undefined}>
          Cadastre-se
        </AuthTextLink>
      </AuthSwitchPrompt>
    </div>
  )
}
