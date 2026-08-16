"use client"

import { useEffect, useRef, useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"

import {
  registerUserAction,
  resendConfirmationAction,
  type RegisterState,
  type ResendConfirmationState,
} from "@/app/register/actions"
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton"
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isLocalhostHost } from "@/lib/password-policy"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile-name"
import { cn } from "@/lib/utils"

const REGISTER_ERRORS: Record<string, string> = {
  missing_fields: "Preencha email, senha e nome de exibição.",
  password_mismatch: "As senhas não coincidem.",
  display_name_taken: "Esse nome de exibição já está em uso. Escolha outro.",
  signup_failed: "Não foi possível concluir o cadastro. Tente novamente.",
  lgpd_consent_required: "Você precisa aceitar a Política de Privacidade para criar uma conta.",
  too_many_attempts: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.",
  // Falhas de servidor: dizem que o problema não é o preenchimento e apontam o
  // cadastro social, que não depende do envio de e-mail e segue funcionando.
  email_send_limit:
    "Não conseguimos enviar o email de confirmação agora — o limite de envios do nosso provedor foi atingido. Tente de novo em alguns minutos, ou cadastre-se com Google/Discord (não precisa de email de confirmação).",
  signup_unavailable:
    "O cadastro está temporariamente indisponível. Tente de novo em alguns minutos, ou cadastre-se com Google/Discord.",
  signup_disabled: "O cadastro por email está desativado no momento. Use Google ou Discord.",
  weak_password: "Senha muito fraca. Escolha uma senha mais forte.",
  invalid_email: "Esse endereço de email não é válido. Confira e tente novamente.",
}

const RESEND_ERRORS: Record<string, string> = {
  missing_fields: "Não foi possível identificar o email. Recarregue a página e tente de novo.",
  email_send_limit: "O limite de envios do nosso provedor de email foi atingido. Tente de novo em alguns minutos.",
  resend_failed: "Não foi possível reenviar agora. Tente de novo em instantes.",
}

const RESEND_COOLDOWN_SECONDS = 60

const initialState: RegisterState = { error: null }
const initialResendState: ResendConfirmationState = { error: null, success: false }

function RegisterSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Criando conta…" : "Criar conta"}
    </Button>
  )
}

function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendConfirmationAction, initialResendState)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (state.success || state.error) {
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }, [state])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending || cooldown > 0}
      >
        {cooldown > 0 ? `Aguarde ${cooldown}s` : pending ? "Enviando…" : "Reenviar email de confirmação"}
      </Button>
      {state.success && (
        <p className="text-center text-xs text-green-600 dark:text-green-400">
          Email reenviado! Verifique sua caixa de entrada.
        </p>
      )}
      {state.error && (
        <p className="text-center text-xs text-destructive">
          {RESEND_ERRORS[state.error] ?? RESEND_ERRORS.resend_failed}
        </p>
      )}
    </form>
  )
}

function LoginLink({
  embedded,
  onSwitchToLogin,
  className,
  children,
}: {
  embedded: boolean
  onSwitchToLogin?: () => void
  className?: string
  children: React.ReactNode
}) {
  if (embedded && onSwitchToLogin) {
    return (
      <button type="button" onClick={onSwitchToLogin} className={className}>
        {children}
      </button>
    )
  }
  return (
    <Link href="/login" className={className}>
      {children}
    </Link>
  )
}

function Field({
  id,
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <Input id={id} name={id} className={cn("border-border bg-muted/20", className)} {...props} />
    </div>
  )
}

interface UserRegisterFormProps {
  /** Usado dentro do AuthModal: troca os `<Link href="/login">` por um callback que muda de aba no próprio modal. */
  embedded?: boolean
  next?: string
  onSwitchToLogin?: () => void
}

export function UserRegisterForm({ embedded = false, next = "/forum", onSwitchToLogin }: UserRegisterFormProps = {}) {
  const [state, action] = useActionState(registerUserAction, initialState)
  const [showPurchase, setShowPurchase] = useState(false)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [relaxed, setRelaxed] = useState(false)
  const [password, setPassword] = useState("")

  // `<form action={fn}>` reseta os campos não controlados assim que a action
  // termina, mesmo em erro (comportamento do React, não um bug do form). Para
  // repopular nome/email depois de um erro é preciso remontar os inputs com
  // `defaultValue` atualizado — daí o `key`, que só muda a cada resposta nova
  // da action (não no mount inicial, por isso o `isFirstRender`).
  const [formKey, setFormKey] = useState(0)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setFormKey((key) => key + 1)
    setPassword("")
  }, [state])

  useEffect(() => {
    setRelaxed(isLocalhostHost(window.location.host))
  }, [])

  const minLength = relaxed ? 6 : 8
  const errorMessage = state.error ? (REGISTER_ERRORS[state.error] ?? state.error) : null

  if (state.alreadyRegistered) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-4 text-sm text-foreground">
          Já existe uma conta com esse email. Faça login, ou use &quot;Esqueci minha senha&quot; se não lembrar a senha.
        </div>
        <LoginLink embedded={embedded} onSwitchToLogin={onSwitchToLogin} className="block">
          <Button className="w-full">Ir para o login</Button>
        </LoginLink>
      </div>
    )
  }

  if (state.needsConfirmation) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-600 dark:text-green-400">
          Conta criada! Enviamos um email de confirmação — confirme seu endereço e depois faça login.
        </div>
        {state.values?.email && <ResendConfirmationForm email={state.values.email} />}
        <LoginLink
          embedded={embedded}
          onSwitchToLogin={onSwitchToLogin}
          className="block text-center text-sm text-primary hover:underline"
        >
          Ir para o login
        </LoginLink>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <GoogleAuthButton label="Cadastrar com Google" next={next} />
      <DiscordAuthButton label="Cadastrar com Discord" next={next} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">ou</span>
        </div>
      </div>

      <form key={formKey} action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Field
            id="display_name"
            label="Nome de exibição"
            type="text"
            autoComplete="nickname"
            placeholder="Como você quer aparecer"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            defaultValue={state.values?.displayName}
            required
          />
          <p className="text-xs text-muted-foreground">
            É único no site e vira o endereço do seu perfil (ex.: sunano.com.br/perfil/seu-nome).
          </p>
        </div>
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          defaultValue={state.values?.email}
          required
        />
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="password">
            Senha
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={relaxed ? `Mínimo ${minLength} caracteres` : "Senha forte"}
            className="border-border bg-muted/20"
            required
            minLength={minLength}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrengthMeter password={password} minLength={minLength} />
        </div>
        <Field
          id="confirm_password"
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a senha"
          required
          minLength={minLength}
        />

        {/* Consentimento LGPD — obrigatório */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/10 px-4 py-3">
          <input
            id="lgpd_consent"
            name="lgpd_consent"
            type="checkbox"
            required
            checked={lgpdConsent}
            onChange={(e) => setLgpdConsent(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <label htmlFor="lgpd_consent" className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
            Li e aceito a{" "}
            <Link
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link
              href="/termos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Termos de Uso
            </Link>
            . Concordo com o tratamento dos meus dados conforme a LGPD (Lei 13.709/2018).
            <span className="ml-1 text-red-400">*</span>
          </label>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <RegisterSubmitButton />
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Já tem conta?{" "}
        <LoginLink embedded={embedded} onSwitchToLogin={onSwitchToLogin} className="text-primary hover:underline">
          Entrar
        </LoginLink>
      </p>
    </div>
  )
}
