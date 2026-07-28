"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"

import { registerUserAction, type RegisterState } from "@/app/register/actions"
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton"
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STRONG_PASSWORD_HINT, isLocalhostHost } from "@/lib/password-policy"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile-name"
import { cn } from "@/lib/utils"

const REGISTER_ERRORS: Record<string, string> = {
  missing_fields: "Preencha email, senha e nome de exibição.",
  password_mismatch: "As senhas não coincidem.",
  email_in_use: "Já existe uma conta com este email.",
  display_name_taken: "Esse nome de exibição já está em uso. Escolha outro.",
  signup_failed: "Não foi possível concluir o cadastro. Tente novamente.",
  lgpd_consent_required: "Você precisa aceitar a Política de Privacidade para criar uma conta.",
  too_many_attempts: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.",
}

const initialState: RegisterState = { error: null }

function RegisterSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Criando conta…" : "Criar conta"}
    </Button>
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

export function UserRegisterForm() {
  const [state, action] = useActionState(registerUserAction, initialState)
  const [showPurchase, setShowPurchase] = useState(false)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [relaxed, setRelaxed] = useState(false)

  useEffect(() => {
    setRelaxed(isLocalhostHost(window.location.host))
  }, [])

  const minLength = relaxed ? 6 : 8
  const errorMessage = state.error ? (REGISTER_ERRORS[state.error] ?? state.error) : null

  if (state.needsConfirmation) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-sm text-green-600 dark:text-green-400">
          Conta criada! Enviamos um email de confirmação — confirme seu endereço e depois faça login.
        </div>
        <Link href="/login" className="block text-center text-sm text-primary hover:underline">
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <GoogleAuthButton label="Cadastrar com Google" next="/forum" />
      <DiscordAuthButton label="Cadastrar com Discord" next="/forum" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">ou</span>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Field
            id="display_name"
            label="Nome de exibição"
            type="text"
            autoComplete="nickname"
            placeholder="Como você quer aparecer"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
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
          />
          {!relaxed && (
            <p className="text-xs text-muted-foreground">{STRONG_PASSWORD_HINT}</p>
          )}
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
        <Link href="/login" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
