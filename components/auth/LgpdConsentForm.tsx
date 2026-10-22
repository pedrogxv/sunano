"use client"

import Link from "next/link"
import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Loader2, ShieldCheck, X } from "lucide-react"

import {
  acceptLgpdConsentAction,
  checkConsentDisplayNameAction,
  declineLgpdConsentAction,
} from "@/app/consentimento/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DISPLAY_NAME_MAX_LENGTH, slugifyDisplayName, validateDisplayName } from "@/lib/profile-name"
import { cn } from "@/lib/utils"

function AcceptButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button className="w-full gap-2" disabled={pending || disabled} type="submit">
      <ShieldCheck className="size-4" />
      {pending ? "Confirmando…" : "Aceitar e continuar"}
    </Button>
  )
}

function DeclineButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  )
}

type NameCheck = {
  state: "idle" | "current" | "checking" | "free" | "taken"
  message: string | null
}

/**
 * Disponibilidade do nome enquanto a pessoa digita. O formato é validado na
 * hora, sem rede; a unicidade espera ela parar de digitar (400ms, o mesmo do
 * `ChangeDisplayNameModal`). O nome que a conta já tem é aceito sem consulta.
 */
function useNameCheck(name: string, initialName: string | null): NameCheck {
  const [remote, setRemote] = useState<{ name: string; check: NameCheck } | null>(null)

  const trimmed = name.trim()
  const enabled = initialName !== null
  const isCurrent = enabled && slugifyDisplayName(trimmed) === slugifyDisplayName(initialName)
  const invalid = enabled && !isCurrent ? validateDisplayName(trimmed) : null
  const needsRemote = enabled && !isCurrent && !invalid

  useEffect(() => {
    if (!needsRemote) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const result = await checkConsentDisplayNameAction(trimmed)
        if (cancelled) return
        // `null`: a conta saiu da janela de escolha; o aceite decide
        setRemote({
          name: trimmed,
          check: result
            ? { state: result.state, message: result.message }
            : { state: "idle", message: null },
        })
      } catch {
        if (!cancelled) setRemote({ name: trimmed, check: { state: "idle", message: null } })
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [needsRemote, trimmed])

  if (!enabled) return { state: "idle", message: null }
  if (isCurrent) return { state: "current", message: null }
  if (invalid) return { state: "taken", message: invalid }
  // Resposta de um nome anterior ainda não vale para o que está no campo
  if (remote?.name !== trimmed) return { state: "checking", message: null }
  return remote.check
}

interface LgpdConsentFormProps {
  next: string
  /**
   * Conta recém-criada por login social: recusar apaga a conta em vez de só
   * sair (ver app/consentimento/actions.ts), e o botão diz isso.
   */
  isFreshSocialAccount?: boolean
  /**
   * Nome que o login social deu à conta. Presente só na conta recém-criada:
   * mostra o campo para a pessoa escolher o próprio nome antes de entrar.
   */
  initialDisplayName?: string | null
  /** "Google", "Discord": de onde o nome sugerido veio. */
  providerLabel?: string | null
}

export function LgpdConsentForm({
  next,
  isFreshSocialAccount = false,
  initialDisplayName = null,
  providerLabel = null,
}: LgpdConsentFormProps) {
  const [state, action] = useActionState(acceptLgpdConsentAction, { error: null })
  const [checked, setChecked] = useState(false)
  // Controlado: o React 19 reseta campos não controlados depois da action, e
  // um "nome já em uso" apagaria o que a pessoa digitou
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "")
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const choosesName = initialDisplayName !== null

  const liveCheck = useNameCheck(displayName, initialDisplayName)
  // O erro do servidor só vale para o nome que foi enviado: ao editar, a
  // checagem ao vivo assume de novo
  const serverNameError = state.nameError && submittedName === displayName ? state.nameError : null
  const nameCheck: NameCheck = serverNameError ? { state: "taken", message: serverNameError } : liveCheck

  const slugPreview = slugifyDisplayName(displayName) || "seu-nome"
  const nameBlocksSubmit =
    choosesName && (!displayName.trim() || nameCheck.state === "checking" || nameCheck.state === "taken")

  return (
    <div className="space-y-5">
      <form action={action} onSubmit={() => setSubmittedName(displayName)} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        {choosesName && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="display_name">
              Nome de exibição
            </label>
            <div className="relative">
              <Input
                id="display_name"
                name="display_name"
                type="text"
                autoComplete="nickname"
                placeholder="Como você quer aparecer"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                aria-invalid={nameCheck.state === "taken"}
                aria-describedby="display_name_status"
                className={cn(
                  "border-border bg-muted/20 pr-9",
                  nameCheck.state === "taken" && "border-red-500/50 focus-visible:ring-red-500/30",
                  nameCheck.state === "free" && "border-emerald-500/40"
                )}
                required
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                {nameCheck.state === "checking" && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                )}
                {(nameCheck.state === "free" || nameCheck.state === "current") && (
                  <Check className="size-4 text-emerald-400" aria-hidden />
                )}
                {nameCheck.state === "taken" && <X className="size-4 text-red-400" aria-hidden />}
              </span>
            </div>

            <p className="truncate text-xs text-muted-foreground/60">
              sunano.com.br/perfil/<span className="text-muted-foreground">{slugPreview}</span>
            </p>

            <p id="display_name_status" aria-live="polite" className="min-h-4 text-xs">
              {nameCheck.state === "current" && (
                <span className="text-muted-foreground">
                  {providerLabel ? `Veio da sua conta ${providerLabel}` : "Veio da sua conta social"}. Pode
                  trocar agora sem custo
                </span>
              )}
              {nameCheck.state === "checking" && (
                <span className="text-muted-foreground">Verificando disponibilidade…</span>
              )}
              {nameCheck.state === "free" && <span className="text-emerald-400">Nome disponível</span>}
              {nameCheck.state === "taken" && nameCheck.message && (
                <span className="text-red-400">{nameCheck.message}</span>
              )}
            </p>
          </div>
        )}

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

        <AcceptButton disabled={!checked || nameBlocksSubmit} />
      </form>

      <form action={declineLgpdConsentAction} className="flex justify-center">
        <DeclineButton label={isFreshSocialAccount ? "Não aceito ou já tenho conta: cancelar esta conta nova" : "Não aceito, sair"} />
      </form>
    </div>
  )
}
