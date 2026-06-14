"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { ShieldCheck } from "lucide-react"

import { cancelTwoFactorAction, verifyTotpAction } from "@/app/2fa/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function VerifySubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full gap-2" disabled={pending || disabled} type="submit">
      <ShieldCheck className="size-4" />
      {pending ? "Verificando…" : "Verificar e entrar"}
    </Button>
  )
}

function SignOutButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
    >
      Não tenho acesso ao app — sair
    </button>
  )
}

export function TwoFactorVerifyForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifyTotpAction, { error: null })
  const [code, setCode] = useState("")

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="code">
            Código de verificação
          </label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="border-border bg-muted/20 text-center text-lg tracking-[0.5em]"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Abra seu app autenticador (Google Authenticator, Authy, 1Password) e digite o código de 6 dígitos.
          </p>
        </div>

        {state.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <VerifySubmitButton disabled={code.length !== 6} />
      </form>

      <form action={cancelTwoFactorAction} className="flex justify-center">
        <SignOutButton />
      </form>
    </div>
  )
}
