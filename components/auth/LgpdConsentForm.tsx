"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { ShieldCheck } from "lucide-react"

import { acceptLgpdConsentAction, declineLgpdConsentAction } from "@/app/consentimento/actions"
import { Button } from "@/components/ui/button"

function AcceptButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full gap-2" disabled={pending || disabled} type="submit">
      <ShieldCheck className="size-4" />
      {pending ? "Confirmando…" : "Aceitar e continuar"}
    </Button>
  )
}

function DeclineButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
    >
      Não aceito — sair
    </button>
  )
}

export function LgpdConsentForm({ next }: { next: string }) {
  const [state, action] = useActionState(acceptLgpdConsentAction, { error: null })
  const [checked, setChecked] = useState(false)

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <input
            type="checkbox"
            name="lgpd_consent"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="text-sm text-foreground">
            Li e aceito a{" "}
            <Link href="/privacidade" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
              Termos de Uso
            </Link>
            .
          </span>
        </label>

        {state.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <AcceptButton disabled={!checked} />
      </form>

      <form action={declineLgpdConsentAction} className="flex justify-center">
        <DeclineButton />
      </form>
    </div>
  )
}
