"use client"

import { useEffect, useRef, useState } from "react"
import { useActionState } from "react"
import Link from "next/link"

import {
  registerUserAction,
  resendConfirmationAction,
  type RegisterState,
  type ResendConfirmationState,
} from "@/app/register/actions"
import {
  AuthAlert,
  AuthDivider,
  AuthField,
  AuthInput,
  AuthPasswordInput,
  AuthSubmitButton,
  AuthSwitchPrompt,
  AuthTextLink,
  usePasswordMinLength,
} from "@/components/auth/auth-form-ui"
import { OAuthButtons } from "@/components/auth/OAuthButton"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"
import { TurnstileField, useTurnstile } from "@/components/auth/TurnstileWidget"
import { ReferralCouponField } from "@/components/referrals/ReferralCouponField"
import { Button } from "@/components/ui/button"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile-name"

const REGISTER_ERRORS: Record<string, string> = {
  missing_fields: "Preencha email, senha e nome de exibição.",
  password_mismatch: "As senhas não coincidem.",
  display_name_taken: "Esse nome de exibição já está em uso. Escolha outro.",
  signup_failed: "Não foi possível concluir o cadastro. Tente novamente.",
  lgpd_consent_required: "Você precisa aceitar a Política de Privacidade para criar uma conta.",
  too_many_attempts: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.",
  captcha_failed: "Não foi possível confirmar que você não é um robô. Tente novamente.",
  // Falhas de servidor: dizem que o problema não é o preenchimento e apontam o
  // cadastro social, que não depende do envio de e-mail e segue funcionando.
  email_send_limit:
    "Não conseguimos enviar o email de confirmação agora: o limite de envios do nosso provedor foi atingido. Tente de novo em alguns minutos, ou cadastre-se com Google/Discord (não precisa de email de confirmação).",
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
  captcha_failed: "Não foi possível confirmar que você não é um robô. Tente novamente.",
  too_many_attempts: "Muitos reenvios seguidos. Aguarde um pouco antes de pedir de novo.",
}

const RESEND_COOLDOWN_SECONDS = 60

const initialState: RegisterState = { error: null }
const initialResendState: ResendConfirmationState = { error: null, success: false }

function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendConfirmationAction, initialResendState)
  const [cooldown, setCooldown] = useState(0)
  const captcha = useTurnstile()

  useEffect(() => {
    if (state.success || state.error) {
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }, [state])

  function submitWithFreshCaptcha(formData: FormData) {
    captcha.rotate()
    action(formData)
  }

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  return (
    <form action={submitWithFreshCaptcha} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      <TurnstileField captcha={captcha} />
      <Button
        type="submit"
        variant="outline"
        className="h-10 w-full rounded-xl"
        disabled={pending || cooldown > 0 || captcha.blocked}
      >
        {cooldown > 0 ? `Aguarde ${cooldown}s` : pending ? "Enviando…" : "Reenviar email de confirmação"}
      </Button>
      {state.success && (
        <p className="text-center text-xs text-emerald-400">
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

interface UserRegisterFormProps {
  /** Usado dentro do AuthModal: troca os `<Link href="/login">` por um callback que muda de aba no próprio modal. */
  embedded?: boolean
  next?: string
  onSwitchToLogin?: () => void
  /**
   * Cupom de indicação já capturado do cookie `sn_inv_ref` pelo servidor.
   * O campo também lê da URL no cliente, para o caso de o cookie não existir.
   */
  referralCode?: string
}

export function UserRegisterForm({
  embedded = false,
  next = "/forum",
  onSwitchToLogin,
  referralCode = "",
}: UserRegisterFormProps = {}) {
  const [state, action] = useActionState(registerUserAction, initialState)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const { relaxed, minLength } = usePasswordMinLength()
  const [password, setPassword] = useState("")
  const captcha = useTurnstile()

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

  function submit(formData: FormData) {
    captcha.rotate()
    action(formData)
  }

  const errorMessage = state.error ? (REGISTER_ERRORS[state.error] ?? state.error) : null

  // Troca de aba no modal; na página, navega para /login.
  const toLogin = embedded ? onSwitchToLogin : undefined

  if (state.alreadyRegistered) {
    return (
      <div className="space-y-4">
        <AuthAlert tone="info">
          Já existe uma conta com esse email. Entre com ela, ou use &quot;Esqueceu a senha?&quot; se não lembrar a senha
        </AuthAlert>
        {toLogin ? (
          <Button type="button" className="h-11 w-full rounded-xl" onClick={toLogin}>
            Ir para o login
          </Button>
        ) : (
          <Button asChild className="h-11 w-full rounded-xl">
            <Link href="/login">Ir para o login</Link>
          </Button>
        )}
      </div>
    )
  }

  if (state.needsConfirmation) {
    return (
      <div className="space-y-4">
        <AuthAlert tone="success">
          Conta criada! Enviamos um email de confirmação: confirme o endereço e depois entre
        </AuthAlert>
        {state.values?.email && <ResendConfirmationForm email={state.values.email} />}
        <AuthSwitchPrompt>
          <AuthTextLink href="/login" onClick={toLogin}>
            Ir para o login
          </AuthTextLink>
        </AuthSwitchPrompt>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <OAuthButtons intent="register" next={next} />

      <AuthDivider label="ou com email" />

      <form key={formKey} action={submit} className="space-y-4">
        <AuthField
          id="display_name"
          label="Nome de exibição"
          hint="É único no site e vira o endereço do seu perfil (sunano.com.br/perfil/seu-nome)"
        >
          <AuthInput
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="nickname"
            placeholder="Como você quer aparecer"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            defaultValue={state.values?.displayName}
            required
          />
        </AuthField>

        <AuthField id="email" label="Email">
          <AuthInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            defaultValue={state.values?.email}
            required
          />
        </AuthField>

        {/* Senha e confirmação lado a lado a partir do `sm`: no modal, empilhadas,
            eram as duas linhas que mais empurravam o botão para baixo. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField id="password" label="Senha">
            <AuthPasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder={relaxed ? `Mínimo ${minLength} caracteres` : "Senha forte"}
              required
              minLength={minLength}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </AuthField>
          <AuthField id="confirm_password" label="Confirmar senha">
            <AuthPasswordInput
              id="confirm_password"
              name="confirm_password"
              autoComplete="new-password"
              placeholder="Repita a senha"
              required
              minLength={minLength}
            />
          </AuthField>
        </div>
        <PasswordStrengthMeter password={password} minLength={minLength} />

        <ReferralCouponField defaultValue={state.values?.referralCode ?? referralCode} />

        {/* Consentimento LGPD — obrigatório */}
        <label
          htmlFor="lgpd_consent"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/10 px-3.5 py-3 transition-colors has-[:checked]:border-violet-500/40 has-[:checked]:bg-violet-500/[0.06]"
        >
          <input
            id="lgpd_consent"
            name="lgpd_consent"
            type="checkbox"
            required
            checked={lgpdConsent}
            onChange={(e) => setLgpdConsent(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-violet-500"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Li e aceito a{" "}
            <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
              Termos de Uso
            </Link>
            . Concordo com o tratamento dos meus dados conforme a LGPD (Lei 13.709/2018).
            <span className="ml-1 text-red-400">*</span>
          </span>
        </label>

        <TurnstileField captcha={captcha} error={state.error === "captcha_failed"} />

        {errorMessage && <AuthAlert>{errorMessage}</AuthAlert>}

        <AuthSubmitButton pendingLabel="Criando conta…" disabled={captcha.blocked}>
          Criar conta
        </AuthSubmitButton>
      </form>

      <AuthSwitchPrompt>
        Já tem conta?{" "}
        <AuthTextLink href="/login" onClick={toLogin}>
          Entrar
        </AuthTextLink>
      </AuthSwitchPrompt>
    </div>
  )
}
