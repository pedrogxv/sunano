"use client"

import { useEffect, useState } from "react"
import { Crown, Flame, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { AuraPrice } from "@/lib/aura-pricing"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DISPLAY_NAME_MAX_LENGTH, slugifyDisplayName, validateDisplayName } from "@/lib/profile-name"

interface ChangeDisplayNameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentName: string
  onChanged: (newName: string, newSlug: string) => void
}

type Status = {
  loading: boolean
  balance: number
  onCooldown: boolean
  cooldownEndsAt: string | null
  /** Preço já com o desconto do tier — vem do servidor (ver a rota GET). */
  price: AuraPrice | null
}

type NameCheck = {
  state: "idle" | "checking" | "free" | "taken"
  message: string | null
}

function formatCooldownEnds(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/**
 * Modal reutilizável de troca de nome de exibição, pago com Aura e sujeito a
 * cooldown de 3 dias — reaproveitado na Central de Aura, nas configurações
 * (`ProfileSection`) e no ícone de editar do "meu perfil" público
 * (`EditNameButton`). Busca saldo, cooldown **e preço** ao abrir em vez de
 * depender de props vindas de cada lugar que o invoca: só a Central tinha o
 * item do catálogo e o tier em mãos, então fora dela o modal anunciava o
 * preço cheio para VIP enquanto a RPC cobrava 10% a menos.
 */
export function ChangeDisplayNameModal({
  open,
  onOpenChange,
  currentName,
  onChanged,
}: ChangeDisplayNameModalProps) {
  const [name, setName] = useState(currentName)
  const [status, setStatus] = useState<Status>({
    loading: true,
    balance: 0,
    onCooldown: false,
    cooldownEndsAt: null,
    price: null,
  })
  const [nameCheck, setNameCheck] = useState<NameCheck>({ state: "idle", message: null })
  const [submitting, setSubmitting] = useState(false)

  const nameChanged = name.trim() !== currentName.trim()
  const slugPreview = slugifyDisplayName(name) || "seu-nome"

  useEffect(() => {
    if (!open) return
    setName(currentName)
    setNameCheck({ state: "idle", message: null })
    setStatus((prev) => ({ ...prev, loading: true }))

    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/aura/display-name", { cache: "no-store" })
        const data = (await res.json().catch(() => null)) as
          | {
              balance?: number
              cooldown?: { onCooldown: boolean; endsAt: string | null }
              price?: AuraPrice | null
            }
          | null
        if (cancelled) return
        setStatus({
          loading: false,
          balance: data?.balance ?? 0,
          onCooldown: data?.cooldown?.onCooldown ?? false,
          cooldownEndsAt: data?.cooldown?.endsAt ?? null,
          price: data?.price ?? null,
        })
      } catch {
        if (!cancelled) setStatus((prev) => ({ ...prev, loading: false }))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, currentName])

  useEffect(() => {
    if (!open || !nameChanged) {
      setNameCheck({ state: "idle", message: null })
      return
    }

    const invalid = validateDisplayName(name)
    if (invalid) {
      setNameCheck({ state: "taken", message: invalid })
      return
    }

    setNameCheck({ state: "checking", message: null })
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/name-check?name=${encodeURIComponent(name.trim())}`)
        const data = (await res.json().catch(() => null)) as
          | { available?: boolean; error?: string | null }
          | null
        if (cancelled) return
        setNameCheck(
          data?.available
            ? { state: "free", message: null }
            : { state: "taken", message: data?.error ?? "Esse nome já está em uso." }
        )
      } catch {
        if (!cancelled) setNameCheck({ state: "idle", message: null })
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, name, nameChanged])

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/aura/display-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; displayName?: string; displaySlug?: string }
        | null
      if (!res.ok || !data?.ok || !data.displayName) {
        throw new Error(data?.error ?? "Erro ao trocar de nome")
      }
      toast.success("Nome atualizado!", { description: data.displayName })
      onChanged(data.displayName, data.displaySlug ?? "")
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao trocar de nome"
      toast.error("Erro ao trocar de nome", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  const price = status.price
  // Item fora do catálogo: a RPC recusaria a troca, então nem oferecemos.
  const unavailable = !status.loading && price === null
  const cost = price?.finalPrice ?? 0
  const insufficientBalance = !status.loading && price !== null && status.balance < cost
  const canConfirm =
    !status.loading &&
    !unavailable &&
    !status.onCooldown &&
    !insufficientBalance &&
    nameChanged &&
    nameCheck.state === "free" &&
    !submitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar nome de exibição</DialogTitle>
          <DialogDescription>
            {status.loading || !price ? (
              "Cooldown de 3 dias entre trocas."
            ) : (
              <>
                Custa{" "}
                {price.discounted && (
                  <span className="text-muted-foreground/70 line-through decoration-[1.5px]">
                    {price.listPrice.toLocaleString("pt-BR")}
                  </span>
                )}{" "}
                <span className="font-semibold text-orange-400">
                  🔥 {price.finalPrice.toLocaleString("pt-BR")} Aura
                </span>
                {price.discounted && (
                  <span className="aura-vip-discount-badge ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] align-middle text-[9px] font-black uppercase leading-none tracking-wide">
                    <Crown className="size-2.5" strokeWidth={2.5} />−{price.discountPercent}%
                  </span>
                )}{" "}
                e tem cooldown de 3 dias entre trocas.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {status.loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : unavailable ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            A troca de nome está indisponível no momento.
          </div>
        ) : status.onCooldown && status.cooldownEndsAt ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Você já trocou de nome recentemente. Disponível novamente em{" "}
            <span className="font-semibold text-foreground">{formatCooldownEnds(status.cooldownEndsAt)}</span>.
          </div>
        ) : (
          <div className="space-y-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn("border-border bg-background", nameCheck.state === "taken" && "border-red-500/50")}
              placeholder="ex: Pedro"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              aria-invalid={nameCheck.state === "taken"}
              autoFocus
            />
            <p className="truncate text-[10px] text-muted-foreground/60">
              sunano.com.br/perfil/<span className="text-muted-foreground">{slugPreview}</span>
            </p>
            {nameCheck.state === "checking" && (
              <p className="text-[10px] text-muted-foreground/60">Verificando disponibilidade…</p>
            )}
            {nameCheck.state === "free" && <p className="text-[10px] text-emerald-400">Nome disponível.</p>}
            {nameCheck.state === "taken" && nameCheck.message && (
              <p className="text-[10px] text-red-400">{nameCheck.message}</p>
            )}
            {insufficientBalance && (
              <p className="text-[10px] text-red-400">
                Saldo de Aura insuficiente ({status.balance.toLocaleString("pt-BR")}/
                {cost.toLocaleString("pt-BR")}).
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {!status.onCooldown && !unavailable && (
            <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              <Flame className="size-3.5" />
              Confirmar ({cost.toLocaleString("pt-BR")} Aura)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
