"use client"

import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { resetPasswordAction } from "@/app/reset-password/actions"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isLocalhostHost } from "@/lib/password-policy"

const initialState = { error: null as string | null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Salvando…" : "Salvar nova senha"}
    </Button>
  )
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState)
  const [relaxed, setRelaxed] = useState(false)
  const [password, setPassword] = useState("")

  useEffect(() => {
    setRelaxed(isLocalhostHost(window.location.host))
  }, [])

  const minLength = relaxed ? 6 : 8

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="password">
          Nova senha
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

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="confirm">
          Confirmar nova senha
        </label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a senha"
          className="border-border bg-muted/20"
          required
          minLength={minLength}
        />
      </div>

      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  )
}
