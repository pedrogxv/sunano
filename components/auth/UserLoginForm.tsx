"use client"

import { useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"

import { loginUserAction } from "@/app/login/actions"
import { forgotPasswordAction } from "@/app/forgot-password/actions"
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton"
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const LOGIN_ERRORS: Record<string, string> = {
  missing_credentials: "Informe email e senha.",
  invalid_credentials: "Email ou senha incorretos.",
}

function LoginSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  )
}

function ForgotSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Enviando…" : "Enviar link de redefinição"}
    </Button>
  )
}

function ForgotMode({ onBack }: { onBack: () => void }) {
  const [state, action] = useActionState(forgotPasswordAction, { error: null, success: false })

  if (state.success) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-600 dark:text-green-400">
          Se o email estiver cadastrado, você receberá as instruções para redefinir sua senha em breve.
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-primary hover:underline"
        >
          ← Voltar ao login
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">Redefinição de senha</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Informe o email da sua conta e enviaremos um link para criar uma nova senha.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="forgot-email">
            Email
          </label>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            className="border-border bg-muted/20"
            required
            autoFocus
          />
        </div>

        {state.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <ForgotSubmitButton />
      </form>

      <button
        type="button"
        onClick={onBack}
        className="text-xs text-primary hover:underline"
      >
        ← Voltar ao login
      </button>
    </div>
  )
}

export function UserLoginForm() {
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [loginState, loginAction] = useActionState(loginUserAction, { error: null })

  const errorMessage = loginState.error
    ? (LOGIN_ERRORS[loginState.error] ?? loginState.error)
    : null

  if (mode === "forgot") {
    return <ForgotMode onBack={() => setMode("login")} />
  }

  return (
    <div className="space-y-5">
      <GoogleAuthButton label="Continuar com Google" next="/forum" />
      <DiscordAuthButton label="Continuar com Discord" next="/forum" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">ou</span>
        </div>
      </div>

      <form action={loginAction} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="email">Email</label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            className="border-border bg-muted/20"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground" htmlFor="password">Senha</label>
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="text-xs text-primary hover:underline"
            >
              Esqueceu a senha?
            </button>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            className="border-border bg-muted/20"
          />
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <LoginSubmitButton />
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Não tem conta?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  )
}
