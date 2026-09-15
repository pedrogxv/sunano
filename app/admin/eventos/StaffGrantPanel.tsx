"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { GrantableUser, EventRecipient } from "@/lib/server/repositories/events-repository"

interface StaffGrantPanelProps {
  eventId: string
  /** Atualiza `currentCount` no formulário acima após uma concessão. */
  onGranted?: () => void
}

/**
 * Painel exclusivo de conquistas `staff_grant`: busca de usuário + botão
 * "Conceder" e a lista de quem já recebeu. Fica separado do `EventForm`
 * porque não existe em nenhum outro critério — só faz sentido depois que a
 * conquista já existe (precisa do `medalId`).
 */
export function StaffGrantPanel({ eventId, onGranted }: StaffGrantPanelProps) {
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<GrantableUser[]>([])
  const [searching, setSearching] = useState(false)
  const [grantingId, setGrantingId] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<EventRecipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function loadRecipients() {
    setLoadingRecipients(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/recipients`)
      const data = (await res.json()) as { recipients?: EventRecipient[] }
      setRecipients(data.recipients ?? [])
    } catch {
      setRecipients([])
    } finally {
      setLoadingRecipients(false)
    }
  }

  useEffect(() => {
    loadRecipients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (!query.trim()) {
      setCandidates([])
      return
    }
    setSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}/grant?q=${encodeURIComponent(query.trim())}`)
        const data = (await res.json()) as { candidates?: GrantableUser[] }
        setCandidates(data.candidates ?? [])
      } catch {
        setCandidates([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, eventId])

  async function handleGrant(user: GrantableUser) {
    setGrantingId(user.id)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao conceder a medalha")
      }
      toast.success("Medalha concedida", { description: user.displayName ?? user.displaySlug })
      setCandidates((prev) => prev.filter((c) => c.id !== user.id))
      await loadRecipients()
      onGranted?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao conceder a medalha"
      toast.error("Erro ao conceder", { description: message })
    } finally {
      setGrantingId(null)
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Conceder para usuário</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Busque por nome ou @usuário e conceda a medalha manualmente. Quem já recebeu não aparece na busca.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome ou @usuário..."
            className="pl-9"
          />
        </div>

        {searching && (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Buscando...
          </div>
        )}

        {!searching && query.trim() && candidates.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
        )}

        {candidates.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {candidates.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar name={user.displayName ?? user.displaySlug} avatarUrl={user.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user.displayName ?? user.displaySlug}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">@{user.displaySlug}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={grantingId === user.id}
                  onClick={() => handleGrant(user)}
                  className="gap-1.5 shrink-0"
                >
                  {grantingId === user.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="size-3.5" />
                  )}
                  Conceder
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quem já recebeu {recipients.length > 0 && `(${recipients.length})`}
        </h3>
        {loadingRecipients ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando...
          </div>
        ) : recipients.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Ninguém recebeu essa medalha ainda.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {recipients.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar name={r.displayName ?? "Usuário"} avatarUrl={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.displayName ?? "Usuário"}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {new Date(r.awardedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
