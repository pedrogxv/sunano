"use client"

import { useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useSearchParams } from "next/navigation"

import { loginAction } from "@/app/admin/actions"
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton"
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton"
import { TurnstileWidget } from "@/components/auth/TurnstileWidget"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/use-t"

const initialState = { error: null as string | null }

const LOGIN_ERROR_KEYS = {
  missing_credentials: "missingCredentials",
  invalid_credentials: "invalidCredentials",
  no_admin_access: "noAdminAccess",
  captcha_failed: "captchaFailed",
  too_many_attempts: "tooManyAttempts",
} as const

// Sem site key o widget não renderiza e o servidor falha aberto (dev local);
// com ela, o envio só libera depois do captcha resolvido.
const CAPTCHA_REQUIRED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

function LoginSubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  const t = useT()
  return (
    <Button className="w-full" disabled={pending || disabled} type="submit">
      {pending ? t.admin.login.signingIn : t.admin.login.signIn}
    </Button>
  )
}

function ForgotSubmitButton() {
  const { pending } = useFormStatus()
  const t = useT()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? t.admin.login.sending : t.admin.login.sendResetLink}
    </Button>
  )
}

type ForgotModeProps = { onBack: () => void }

function ForgotMode({ onBack }: ForgotModeProps) {
  const t = useT()
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Token do Turnstile é de uso único: cada envio remonta o widget.
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()

    if (!trimmed) {
      setError(t.admin.login.enterEmail)
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t.admin.login.enterValidEmail)
      return
    }

    setPending(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, turnstileToken: captchaToken }),
      })
      // Só o captcha recusado volta como erro: qualquer outra resposta segue
      // genérica, para não revelar se o email existe.
      if (res.status === 400) {
        setError(t.admin.login.errors.captchaFailed)
        setCaptchaToken(null)
        setCaptchaKey((key) => key + 1)
        return
      }
      setSent(true)
    } catch {
      // Falha de rede também mostra sucesso, pelo mesmo motivo acima.
      setSent(true)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-200">
          {t.admin.login.resetSentIfRegistered}
        </div>
        <button type="button" onClick={onBack} className="text-xs text-primary hover:underline">
          ← {t.admin.login.backToLogin}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">
          {t.admin.login.passwordReset}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.admin.login.passwordResetDesc}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="reset-email">
            Email
          </label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            placeholder="admin@sunano.com"
            className="border-border bg-card/50 text-foreground placeholder:text-muted-foreground"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>

        <TurnstileWidget key={captchaKey} onTokenChange={setCaptchaToken} />

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <Button className="w-full" disabled={pending || (CAPTCHA_REQUIRED && !captchaToken)} type="submit">
          {pending ? t.admin.login.sending : t.admin.login.sendResetLink}
        </Button>
      </form>

      <button type="button" onClick={onBack} className="text-xs text-primary hover:underline">
        ← {t.admin.login.backToLogin}
      </button>
    </div>
  )
}

export function AdminLoginForm() {
  const t = useT()
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [state, formAction] = useActionState(loginAction, initialState)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  // O token do Turnstile é de uso único e já foi lido para o FormData neste ponto: o widget remonta para a próxima tentativa.
  function submitWithFreshCaptcha(formData: FormData) {
    setCaptchaToken(null)
    setCaptchaKey((key) => key + 1)
    formAction(formData)
  }
  // O login por OAuth não passa pela server action: quando ele recusa o acesso
  // ao painel, o motivo volta na query string.
  const searchParams = useSearchParams()

  const rawError = state.error ?? searchParams.get("error")
  const localizedError = rawError
    ? LOGIN_ERROR_KEYS[rawError as keyof typeof LOGIN_ERROR_KEYS]
      ? t.admin.login.errors[LOGIN_ERROR_KEYS[rawError as keyof typeof LOGIN_ERROR_KEYS]]
      : rawError
    : null

  if (mode === "forgot") {
    return <ForgotMode onBack={() => setMode("login")} />
  }

  return (
    <div className="space-y-4">
      <GoogleAuthButton label={t.admin.login.continueWithGoogle} next="/admin" />
      <DiscordAuthButton label={t.admin.login.continueWithDiscord} next="/admin" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">{t.admin.login.or}</span>
        </div>
      </div>

      <form action={submitWithFreshCaptcha} className="space-y-4">
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
          {t.admin.login.password}
        </label>
        <Input
          autoComplete="current-password"
          className="border-border bg-card/50 text-foreground placeholder:text-muted-foreground"
          id="password"
          name="password"
          placeholder={t.admin.login.yourPassword}
          type="password"
        />
      </div>

      <TurnstileWidget
        key={captchaKey}
        onTokenChange={setCaptchaToken}
        error={state.error === "captcha_failed"}
      />
      <input type="hidden" name="cf_turnstile_response" value={captchaToken ?? ""} />

      {localizedError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {localizedError}
        </div>
      )}

      <LoginSubmitButton disabled={CAPTCHA_REQUIRED && !captchaToken} />

      <Button
        className="w-full"
        type="button"
        variant="ghost"
        onClick={() => setMode("forgot")}
      >
        {t.admin.login.forgotPassword}
      </Button>
      </form>
    </div>
  )
}
