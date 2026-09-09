"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Check, Gift, X } from "lucide-react"
import { toast } from "sonner"

import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"

type AdminReferral = {
  userId: string
  displayName: string
  avatarUrl: string | null
  status: "pending" | "validated" | "rejected" | "expired"
  validatedVia: string | null
  expiresAt: string
  createdAt: string
  referrerId: string
  referrerName: string
  rejectedReason: string | null
}

/**
 * A aba padrão é "Para revisar": as indicações barradas por teto de rede/IP.
 * São as únicas em que uma pessoa legítima pode ter sido pega junto (família
 * na mesma casa, CGNAT, faculdade), e portanto as únicas que realmente pedem
 * decisão humana. As outras abas existem para consulta.
 */
const TABS = [
  { key: "capped", label: "Para revisar" },
  { key: "pending", label: "Aguardando" },
  { key: "validated", label: "Confirmadas" },
  { key: "rejected", label: "Rejeitadas" },
] as const

const REASON_LABEL: Record<string, string> = {
  ip_limit: "Muitas indicações da mesma rede",
  max_per_user: "Limite de indicações atingido",
  admin_rejected: "Rejeitada por um admin",
}

export default function AdminIndicacoesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("capped")
  const [referrals, setReferrals] = useState<AdminReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  usePageHeader("Indicações", "Programa de indicação de amigos")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params =
        tab === "capped" ? "onlyCapped=1" : `status=${tab}`
      const res = await fetch(`/api/admin/indicacoes?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar.")
      setReferrals(data.referrals ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar.")
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  async function review(referredUserId: string, approve: boolean) {
    setBusy(referredUserId)
    try {
      const res = await fetch("/api/admin/indicacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referredUserId, approve }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Erro.")
      toast.success(approve ? "Indicação liberada — Aura creditada." : "Indicação rejeitada.")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              tab === item.key
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "capped" && (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>
            Indicações barradas automaticamente por virem da mesma rede ou por estourarem o limite.
            Várias pessoas de uma mesma casa é um caso legítimo comum — confira antes de rejeitar.
            Aprovar credita a Aura ao indicador.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <BoxLoader />
        </div>
      ) : referrals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Gift className="mx-auto mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nada por aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {referrals.map((item) => (
            <div
              key={item.userId}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <UserAvatar name={item.displayName} avatarUrl={item.avatarUrl} size={10} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  indicado por <strong className="text-foreground">{item.referrerName}</strong> ·{" "}
                  {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                </p>
                {item.rejectedReason && (
                  <Badge variant="outline" className="mt-1.5 text-xs">
                    {REASON_LABEL[item.rejectedReason] ?? item.rejectedReason}
                  </Badge>
                )}
              </div>

              {item.status === "validated" ? (
                <Badge className="gap-1">
                  <Check className="size-3" /> Confirmada
                </Badge>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => review(item.userId, true)}
                    disabled={busy === item.userId}
                    className="gap-1.5"
                  >
                    <Check className="size-3.5" />
                    Liberar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review(item.userId, false)}
                    disabled={busy === item.userId}
                    className="gap-1.5 text-red-400 hover:text-red-300"
                  >
                    <X className="size-3.5" />
                    Rejeitar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
