"use client"

import { useFormStatus } from "react-dom"
import { confirmRecoveryAction } from "@/app/reset-password/actions"
import { Button } from "@/components/ui/button"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Confirmando…" : "Continuar"}
    </Button>
  )
}

export function ConfirmRecoveryForm({
  tokenHash,
  code,
}: {
  tokenHash?: string
  code?: string
}) {
  return (
    <form action={confirmRecoveryAction} className="space-y-4">
      {tokenHash && <input type="hidden" name="token_hash" value={tokenHash} />}
      {code && <input type="hidden" name="code" value={code} />}
      <SubmitButton />
    </form>
  )
}
