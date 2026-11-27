"use client"

import { useActionState, useState } from "react"
import { resetPasswordAction } from "@/app/reset-password/actions"
import { AuthAlert, AuthField, AuthPasswordInput, AuthSubmitButton, usePasswordMinLength } from "@/components/auth/auth-form-ui"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"

const initialState = { error: null as string | null }

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState)
  const { relaxed, minLength } = usePasswordMinLength()
  const [password, setPassword] = useState("")


  return (
    <form action={formAction} className="space-y-4">
      <AuthField id="password" label="Nova senha">
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
        <PasswordStrengthMeter password={password} minLength={minLength} />
      </AuthField>

      <AuthField id="confirm" label="Confirmar nova senha">
        <AuthPasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          placeholder="Repita a senha"
          required
          minLength={minLength}
        />
      </AuthField>

      {state.error && <AuthAlert>{state.error}</AuthAlert>}

      <AuthSubmitButton pendingLabel="Salvando…">Salvar nova senha</AuthSubmitButton>
    </form>
  )
}
