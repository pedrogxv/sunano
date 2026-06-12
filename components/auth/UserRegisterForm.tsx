"use client"

import { useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { ChevronDown, ShoppingBag } from "lucide-react"

import { registerUserAction, type RegisterState } from "@/app/register/actions"
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const REGISTER_ERRORS: Record<string, string> = {
  missing_fields: "Preencha email, senha e nome de exibição.",
  password_too_short: "A senha precisa ter ao menos 6 caracteres.",
  password_mismatch: "As senhas não coincidem.",
  email_in_use: "Já existe uma conta com este email.",
  signup_failed: "Não foi possível concluir o cadastro. Tente novamente.",
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

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs text-muted-foreground">ou</span>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <Field
          id="display_name"
          label="Nome de exibição"
          type="text"
          autoComplete="nickname"
          placeholder="Como você quer aparecer"
          required
        />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
        />
        <Field
          id="password"
          label="Senha"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
          required
        />
        <Field
          id="confirm_password"
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a senha"
          required
        />

        {/* Seção opcional: dados para compras (cadastro completo) */}
        <div className="rounded-xl border border-border bg-muted/10">
          <button
            type="button"
            onClick={() => setShowPurchase((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2.5">
              <ShoppingBag className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Quero comprar na loja
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                showPurchase && "rotate-180"
              )}
            />
          </button>

          {showPurchase && (
            <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
              <p className="text-xs text-muted-foreground">
                Opcional. Preencha para deixar seus dados de compra prontos. Você também
                pode completar depois, na hora de comprar.
              </p>
              <Field
                id="full_name"
                label="Nome completo"
                type="text"
                autoComplete="name"
                placeholder="Seu nome completo"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field id="cpf" label="CPF" type="text" inputMode="numeric" placeholder="000.000.000-00" />
                <Field id="phone" label="Telefone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <Field id="postal_code" label="CEP" type="text" inputMode="numeric" placeholder="00000-000" autoComplete="postal-code" />
                <Field id="state" label="Estado (UF)" type="text" maxLength={2} placeholder="SP" autoComplete="address-level1" />
              </div>
              <Field id="street" label="Rua / Logradouro" type="text" autoComplete="address-line1" placeholder="Av. Exemplo" />
              <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                <Field id="number" label="Número" type="text" placeholder="123" />
                <Field id="complement" label="Complemento" type="text" placeholder="Apto, bloco…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="neighborhood" label="Bairro" type="text" placeholder="Centro" />
                <Field id="city" label="Cidade" type="text" autoComplete="address-level2" placeholder="São Paulo" />
              </div>
            </div>
          )}
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
