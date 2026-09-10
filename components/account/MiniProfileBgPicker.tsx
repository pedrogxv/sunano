"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Ban, Check, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  MINI_PROFILE_BG_THEMES,
  MINI_PROFILE_BG_TIER_ACCENT,
  MINI_PROFILE_BG_TIER_LABEL,
  getMiniProfileBgTheme,
  type MiniProfileBgTheme,
} from "@/lib/mini-profile-backgrounds"
import {
  MiniProfileBackground,
  miniProfileBgBorderClass,
  miniProfileBgVars,
} from "@/components/profile/MiniProfileBackground"
import { invalidateMiniProfile } from "@/components/profile/MiniProfileHoverCard"

type OwnedBg = { id: string; slug: string; name: string }

/**
 * Seletor do Fundo de Mini Perfil equipado, dentro do editor de perfil.
 *
 * Só lista o que o usuário JÁ POSSUI: comprar é assunto da Central de Aura, e
 * duplicar a vitrine aqui só daria dois lugares para o mesmo preço divergir.
 * Quem não tem nenhum vê o convite para a loja.
 *
 * Página client (ver ARQUITETURA.md), então os dados vêm de
 * `/api/aura/mini-profile-bg` e a troca vai por `POST` nas rotas de
 * equipar/desequipar — nunca direto no banco.
 *
 * Enquanto NÃO houver fundo nenhum à venda (`MINI_PROFILE_BG_THEMES` vazio,
 * como hoje), o seletor some inteiro em vez de mostrar o convite para a loja:
 * mandar o usuário para uma vitrine vazia é pior do que não mencionar o
 * recurso. Voltar a listar temas lá reacende este bloco sozinho.
 */
/** Há algo à venda? Constante de módulo: o catálogo é estático, não muda em runtime. */
const HAS_CATALOG = MINI_PROFILE_BG_THEMES.length > 0

export function MiniProfileBgPicker() {
  const [owned, setOwned] = useState<OwnedBg[] | null>(null)
  const [equippedId, setEquippedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!HAS_CATALOG) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/aura/mini-profile-bg")
        const data = (await res.json().catch(() => null)) as
          | { owned?: OwnedBg[]; equippedItemId?: string | null }
          | null
        if (cancelled || !res.ok || !data) {
          if (!cancelled) setOwned([])
          return
        }
        setOwned(data.owned ?? [])
        setEquippedId(data.equippedItemId ?? null)
      } catch {
        // Um seletor que não carregou vira "você ainda não tem nenhum" — o
        // resto do editor de perfil continua funcionando normalmente.
        if (!cancelled) setOwned([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function equip(itemId: string | null) {
    // Clicar no que já está equipado desequipa — mesmo gesto do botão
    // "Equipado" dos cards da Central de Aura.
    const target = itemId === equippedId ? null : itemId
    setSaving(itemId ?? "none")
    try {
      const url = target
        ? `/api/aura/mini-profile-bg/${target}/equip`
        : "/api/aura/mini-profile-bg/unequip"
      const res = await fetch(url, { method: "POST" })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Erro ao equipar o fundo")
      }
      setEquippedId(target)
      // O cartão de Mini Perfil guarda o que já buscou por slug; sem limpar,
      // o dono continuaria vendo o fundo anterior no hover até a aba recarregar.
      invalidateMiniProfile()
      toast.success(target ? "Fundo equipado" : "Fundo removido")
    } catch (err) {
      toast.error("Erro ao equipar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      })
    } finally {
      setSaving(null)
    }
  }

  if (!HAS_CATALOG) return null

  if (owned === null) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-muted/10 py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (owned.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center">
        <Sparkles className="mx-auto size-5 text-orange-500/70" />
        <p className="mt-2 text-sm font-semibold text-foreground">
          Você ainda não tem nenhum Fundo de Mini Perfil
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bordas com brilho, raios, partículas e mais, a partir de 50 de Aura.
        </p>
        <Link
          href="/aura"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-[#1a1200] transition-colors hover:bg-orange-400"
        >
          Ver na Central de Aura
        </Link>
      </div>
    )
  }

  const withTheme = owned
    .map((item) => ({ item, theme: getMiniProfileBgTheme(item.slug) }))
    .filter((e): e is { item: OwnedBg; theme: MiniProfileBgTheme } => e.theme !== null)

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-muted/10 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* "Nenhum" primeiro: voltar ao cartão padrão precisa ser tão fácil
            quanto trocar de tema. */}
        <button
          type="button"
          onClick={() => equip(null)}
          disabled={saving !== null}
          className={cn(
            "relative flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors",
            equippedId === null
              ? "border-emerald-400/60 bg-emerald-400/5 text-emerald-300"
              : "border-border text-muted-foreground hover:border-[#3a3a3a] hover:bg-muted/30"
          )}
        >
          {saving === "none" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Ban className="size-4" />
          )}
          <span className="text-[11px] font-bold">Nenhum</span>
          {equippedId === null && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[#04140d]">
              <Check className="size-2.5" strokeWidth={3} />
            </span>
          )}
        </button>

        {withTheme.map(({ item, theme }) => {
          const isEquipped = equippedId === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => equip(item.id)}
              disabled={saving !== null}
              title={isEquipped ? "Clique para remover" : `Equipar ${theme.name}`}
              className={cn(
                "group relative aspect-[4/3] overflow-hidden rounded-xl border-2 transition-transform",
                isEquipped
                  ? "border-emerald-400/70"
                  : "border-transparent hover:-translate-y-0.5",
                miniProfileBgBorderClass(theme)
              )}
              style={miniProfileBgVars(theme)}
            >
              <MiniProfileBackground theme={theme} />

              <span className="relative z-[1] flex h-full flex-col items-center justify-center gap-1">
                <span className="size-6 rounded-full border-2 border-white/70 bg-white/15" />
                <span className="h-1 w-9 rounded-full bg-white/70" />
              </span>

              <span
                className="absolute left-1.5 top-1.5 z-[2] rounded px-1 py-px text-[8px] font-black uppercase tracking-wide text-black/85"
                style={{ backgroundColor: MINI_PROFILE_BG_TIER_ACCENT[theme.tier] }}
              >
                {MINI_PROFILE_BG_TIER_LABEL[theme.tier]}
              </span>

              {saving === item.id && (
                <span className="absolute inset-0 z-[3] flex items-center justify-center bg-black/50">
                  <Loader2 className="size-4 animate-spin text-white" />
                </span>
              )}

              {isEquipped && (
                <span className="absolute right-1.5 top-1.5 z-[2] flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[#04140d]">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              )}

              <span className="absolute inset-x-0 bottom-0 z-[2] truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-bold text-white">
                {theme.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
