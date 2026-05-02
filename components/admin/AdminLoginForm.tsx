"use client"

import { useRef, useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { loginAction } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLocale } from "@/lib/locale-context"

const initialState = { error: null as string | null }

const LOGIN_ERROR_MESSAGES = {
  missing_credentials: {
    en: "Enter email and password.",
    pt: "Informe email e senha.",
  },
  invalid_credentials: {
    en: "Invalid credentials.",
    pt: "Credenciais invalidas.",
  },
  no_admin_access: {
    en: "Account has no admin access.",
    pt: "Conta sem acesso ao admin.",
  },
} as const

function SubmitButton({ isEnglish }: { isEnglish: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? (isEnglish ? "Signing in..." : "Entrando...") : (isEnglish ? "Sign in" : "Entrar")}
    </Button>
  )
}

export function AdminLoginForm() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [state, formAction] = useActionState(loginAction, initialState)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)

  const localizedError = state.error
    ? LOGIN_ERROR_MESSAGES[state.error as keyof typeof LOGIN_ERROR_MESSAGES]
      ? isEnglish
        ? LOGIN_ERROR_MESSAGES[state.error as keyof typeof LOGIN_ERROR_MESSAGES].en
        : LOGIN_ERROR_MESSAGES[state.error as keyof typeof LOGIN_ERROR_MESSAGES].pt
      : state.error
    : null

  async function handleForgotPassword() {
    const formElement = formRef.current
    const email = formElement
      ? String(new FormData(formElement).get("email") || "").trim()
      : ""

    setResetPending(true)
    setResetMessage(null)

    try {
      await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      setResetMessage(isEnglish ? "If the email is registered, we sent the instructions." : "Se o email estiver cadastrado, enviamos as instruções.")
    } catch {
      setResetMessage(isEnglish ? "If the email is registered, we sent the instructions." : "Se o email estiver cadastrado, enviamos as instruções.")
    } finally {
      setResetPending(false)
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="email">
          Email
        </label>
        <Input
          autoComplete="email"
          className="border-border bg-card/50 text-foreground placeholder:text-muted-foreground"
          id="email"
          name="email"
          placeholder="admin@sunano.com"
          type="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="password">
          {isEnglish ? "Password" : "Senha"}
        </label>
        <Input
          autoComplete="current-password"
          className="border-border bg-card/50 text-foreground placeholder:text-muted-foreground"
          id="password"
          name="password"
          placeholder={isEnglish ? "Your password" : "Sua senha"}
          type="password"
        />
      </div>

      {localizedError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {localizedError}
        </div>
      ) : null}

      {resetMessage ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {resetMessage}
        </div>
      ) : null}

      <SubmitButton isEnglish={isEnglish} />

      <Button
        className="w-full"
        disabled={resetPending}
        onClick={handleForgotPassword}
        type="button"
        variant="ghost"
      >
        {resetPending ? (isEnglish ? "Sending..." : "Enviando...") : (isEnglish ? "Forgot my password" : "Esqueci minha senha")}
      </Button>
    </form>
  )
}