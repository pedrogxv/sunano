"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Search, Star, Trash2, UserCheck, X } from "lucide-react"
import { toast } from "sonner"

import { StoreProductPicker } from "@/components/admin/StoreProductPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type { AdminReviewGrant } from "@/lib/server/repositories/store-review-grants-repository"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

type UserHit = { id: string; displayName: string; email: string | null; avatarUrl: string | null }

/** Autocomplete de conta (nome ou e-mail), com debounce. */
function useUserSearch() {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<UserHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/store/review-grants?users=${encodeURIComponent(term)}`)
        const json = (await res.json()) as { users?: UserHit[] }
        if (!cancelled) setHits(json.users ?? [])
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return { query, setQuery, hits, setHits, searching }
}

async function fetchGrants(): Promise<AdminReviewGrant[]> {
  const res = await fetch("/api/admin/store/review-grants", { cache: "no-store" })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    toast.error(json?.error ?? "Erro ao carregar liberações.")
    return []
  }
  return json.grants as AdminReviewGrant[]
}

/**
 * Liberação de avaliação para cliente que comprou FORA do site. A pessoa
 * recebe um aviso no sino, avalia em Meus Pedidos e ganha a mesma Aura de
 * quem comprou aqui; a avaliação sai como "Cliente Sunano".
 */
export function ReviewGrantsSection() {
  const [grants, setGrants] = useState<AdminReviewGrant[] | null>(null)
  const [user, setUser] = useState<UserHit | null>(null)
  const [products, setProducts] = useState<StoreProductCard[]>([])
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const users = useUserSearch()

  const load = useCallback(async () => {
    setGrants(await fetchGrants())
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchGrants().then((next) => {
      if (!cancelled) setGrants(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    if (!user || products.length === 0) return
    setSaving(true)
    const res = await fetch("/api/admin/store/review-grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, productIds: products.map((p) => p.id), note: note.trim() || null }),
    })
    const json = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      toast.error(json?.error ?? "Erro ao liberar.")
      return
    }
    const created = (json?.created as number | undefined) ?? 0
    toast.success(
      created > 0
        ? `Liberado. ${user.displayName} foi avisado(a) no sino.`
        : "Esses produtos já estavam liberados para essa conta."
    )
    setUser(null)
    setProducts([])
    setNote("")
    await load()
  }

  async function revoke(grant: AdminReviewGrant) {
    if (!window.confirm(`Revogar a avaliação de ${grant.product.name} para ${grant.user.displayName}?`)) return
    const res = await fetch(`/api/admin/store/review-grants/${grant.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao revogar.")
      return
    }
    await load()
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <UserCheck className="size-4" /> Liberar avaliação para cliente antigo
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Para quem comprou com você antes da loja e já tem conta no site. A pessoa recebe um aviso, avalia em Meus
          Pedidos e ganha a mesma Aura de uma compra no site (+10, ou +20 com foto). A avaliação aparece como
          &quot;Cliente Sunano&quot;, não como compra verificada.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        {/* Conta */}
        {user ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
            <ProfileAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setUser(null)} aria-label="Trocar conta">
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <UserSearchInput state={users} onPick={setUser} />
        )}

        {/* Produtos: um por vez, acumulando na lista abaixo. */}
        <StoreProductPicker
          value={null}
          placeholder="Adicionar produto que a pessoa comprou…"
          onChange={(product) => {
            if (product) setProducts((prev) => (prev.some((p) => p.id === product.id) ? prev : [...prev, product]))
          }}
        />
        {products.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => (
              <span
                key={p.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs"
              >
                <span className="truncate">{p.name}</span>
                <button
                  type="button"
                  aria-label={`Remover ${p.name}`}
                  onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))}
                  className="rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Input
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação interna (opcional). Ex: comprou pelo WhatsApp em março"
          className="text-sm"
        />

        <div className="flex justify-end">
          <Button onClick={submit} disabled={!user || products.length === 0 || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Liberar avaliação
          </Button>
        </div>
      </div>

      {grants === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : grants.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <ProfileAvatar name={g.user.displayName} avatarUrl={g.user.avatarUrl} size="sm" frame={g.user.frame} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-medium">{g.user.displayName}</span>
                  <span className="text-muted-foreground"> · {g.product.name}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(g.created_at).toLocaleDateString("pt-BR")}
                  {g.note ? ` · ${g.note}` : ""}
                </p>
              </div>
              {g.reviewRating !== null ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  Avaliou <Star className="size-3 fill-current" /> {g.reviewRating}
                </span>
              ) : (
                <>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    Aguardando
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => revoke(g)} aria-label="Revogar">
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function UserSearchInput({
  state,
  onPick,
}: {
  state: ReturnType<typeof useUserSearch>
  onPick: (hit: UserHit) => void
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={state.query}
        onChange={(e) => {
          state.setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar conta por nome ou e-mail…"
        className="h-9 pl-8 text-sm"
      />
      {state.searching && (
        <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && state.hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {state.hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => {
                onPick(hit)
                state.setQuery("")
                state.setHits([])
                setOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              {/* Typeahead: avatar pequeno, sem moldura (ver "Molduras" no AGENTS.md). */}
              <ProfileAvatar name={hit.displayName} avatarUrl={hit.avatarUrl} size="xs" />
              <span className="min-w-0 truncate text-sm">{hit.displayName}</span>
              {hit.email && <span className="min-w-0 truncate text-xs text-muted-foreground">{hit.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
