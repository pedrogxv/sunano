"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Ban, Check, Loader2, Lock, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { frameFromWire, type ProfileFrame } from "@/lib/profile-frames"
import type { FrameLockReason } from "@/lib/server/repositories/frame-collection-repository"
import { cn } from "@/lib/utils"

/**
 * O porquê de a moldura ainda não ser sua. IMPORTADO do repositório, nunca
 * redigitado: enquanto era uma cópia à mão, trocar `unavailable` por `rank`
 * lá deixava esta lista desatualizada sem o compilador reclamar — e o
 * `LOCK_COPY` abaixo caía em `undefined`, apagando o rótulo do card.
 * `import type` é apagado no build, então não puxa `server-only` pro bundle.
 */
type FrameLock = FrameLockReason | null

type WireEntry = {
  itemId: string | null
  slug: string
  owned: boolean
  equipped: boolean
  lock: FrameLock
  /** Dá para gravar no slot. Falso na de VIP, que vem por precedência. */
  equippable: boolean
  progressLabel: string | null
  auraCost: number | null
  assetUrl: string | null
  name: string
  description: string
}

type CollectionEntry = WireEntry & { frame: ProfileFrame }

/**
 * O que cada bloqueio diz e para onde ele manda. Uma vitrine que só apaga a
 * moldura não ensina nada: a pessoa precisa saber se aquilo se compra, se
 * conquista ou se assina — e ter o caminho a um clique.
 */
const LOCK_COPY: Record<
  Exclude<FrameLock, null>,
  { label: string; href: string | null; cta: string | null }
> = {
  streak: { label: "Ofensiva", href: "/aura#tarefas", cta: "Ver tarefas" },
  vip: { label: "Exclusiva do VIP", href: "/conta#assinatura", cta: "Virar VIP" },
  founder: { label: "Fundador", href: "/conta#assinatura", cta: "Virar VIP" },
  purchase: { label: "Na Central de Aura", href: "/aura#molduras", cta: "Ver na Central" },
  // NÃO é "em breve": a moldura existe e é concedida assim que a pessoa
  // entra no top 3 (cron `/api/cron/rank-frames`). O que falta é a
  // colocação — dizer "em breve" fazia parecer que a feature não tinha
  // lançado, quando o bloqueio era do usuário e não do site.
  rank: { label: "Top 3 do ranking", href: "/pessoas", cta: "Ver ranking" },
}

/**
 * Seletor da moldura do avatar, dentro do editor de perfil.
 *
 * POR QUE ELE EXISTE AQUI, E NÃO SÓ NA CENTRAL DE AURA
 * -----------------------------------------------------
 * Equipar só existia em `/aura`, misturado à loja — e lá a vitrine mostrava
 * um botão "Equipar" para o MAIOR marco de ofensiva e nenhum para os outros
 * três, mesmo a pessoa possuindo os quatro de verdade em `user_aura_items`.
 * Quem tinha 50 dias não conseguia exibir o anel discreto de 1 dia, e quem
 * queria trocar de moldura tinha de sair do editor de perfil, achar a seção
 * certa da loja e voltar.
 *
 * A moldura é aparência de perfil, então mora onde a pessoa edita o perfil —
 * ao lado da foto, do banner e do Fundo de Mini Perfil, com os previews
 * reagindo ao clique. Comprar continua sendo assunto da Central: aqui a
 * moldura bloqueada mostra o caminho, nunca o preço duplicado.
 *
 * Mesmo contrato do `MiniProfileBgPicker`: página client (ver ARQUITETURA.md),
 * dados por `GET /api/aura/frames`, troca por POST nas MESMAS rotas de
 * equipar/desequipar que a Central usa — o slot é um só.
 */
export function ProfileFramePicker({ onEquipChange }: { onEquipChange?: () => void }) {
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null)
  const [equippedId, setEquippedId] = useState<string | null>(null)
  /** O dono pediu para não ter moldura nenhuma — ver `avatar_frame_opt_out`. */
  const [optOut, setOptOut] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  /** Mostrar também as que ainda não são suas. Começa fechado: a coleção é
   *  sobre o que a pessoa tem; o resto é convite, e convite não abre a tela. */
  const [showLocked, setShowLocked] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [framesRes, meRes] = await Promise.all([
          fetch("/api/aura/frames"),
          fetch("/api/auth/me"),
        ])
        const data = (await framesRes.json().catch(() => null)) as
          | { entries?: WireEntry[]; equippedItemId?: string | null; frameOptOut?: boolean }
          | null
        if (cancelled || !framesRes.ok || !data) {
          if (!cancelled) setEntries([])
          return
        }

        // A foto entra no preview de cada moldura: ver o anel em volta do
        // PRÓPRIO rosto é o que deixa a escolha óbvia — num quadrado vazio
        // todas as molduras parecem iguais.
        const me = (await meRes.json().catch(() => null)) as
          | { userProfile?: { avatar_url?: string | null; display_name?: string | null } }
          | null
        if (!cancelled) {
          setAvatarUrl(me?.userProfile?.avatar_url ?? null)
          setName(me?.userProfile?.display_name ?? "")
        }

        const resolved = (data.entries ?? [])
          .map((entry) => {
            const frame = frameFromWire(entry.slug, entry.assetUrl)
            return frame ? { ...entry, frame } : null
          })
          // Moldura sem arte no código não tem o que desenhar — some da
          // coleção em vez de virar um quadrado vazio (degradação suave).
          .filter((entry): entry is CollectionEntry => entry !== null)

        if (!cancelled) {
          setEntries(resolved)
          setEquippedId(data.equippedItemId ?? null)
          setOptOut(Boolean(data.frameOptOut))
        }
      } catch {
        // Seletor que não carregou vira "nenhuma moldura ainda" — o resto do
        // editor de perfil continua funcionando normalmente.
        if (!cancelled) setEntries([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function equip(itemId: string | null) {
    // Clicar no que já está equipado desequipa — mesmo gesto do botão
    // "Equipado" dos cards da Central de Aura e do seletor de Mini Perfil.
    const target = itemId === equippedId ? null : itemId
    setSaving(itemId ?? "none")
    try {
      const url = target ? `/api/aura/items/${target}/equip` : "/api/aura/items/unequip"
      const res = await fetch(url, { method: "POST" })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao equipar a moldura")

      setEquippedId(target)
      // "Nenhuma" é uma ESCOLHA gravada (opt-out), não só o slot vazio: sem
      // ela o site voltaria a desenhar a honraria por precedência.
      setOptOut(target === null)
      setEntries((prev) =>
        prev
          ? prev.map((entry) => ({ ...entry, equipped: entry.itemId === target && target !== null }))
          : prev
      )
      // A moldura viaja pelo contexto de sessão (`/api/auth/me`), que alimenta
      // a topbar, o mini perfil e os previews deste editor. Sem avisar, a
      // escolha só apareceria depois de um F5.
      onEquipChange?.()
      toast.success(target ? "Moldura equipada" : "Moldura removida")
    } catch (err) {
      toast.error("Erro ao equipar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      })
    } finally {
      setSaving(null)
    }
  }

  if (entries === null) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-muted/10 py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const owned = entries.filter((entry) => entry.owned)
  const locked = entries.filter((entry) => !entry.owned)

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-3">
      {owned.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/40 px-4 py-6 text-center">
          <Sparkles className="mx-auto size-5 text-orange-500/70" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            Você ainda não tem nenhuma moldura
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete as missões diárias para ganhar as de Ofensiva, ou veja as da Central de Aura.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {/* "Nenhuma" primeiro: tirar a moldura precisa ser tão fácil quanto
              trocar de moldura. */}
          <FrameTile
            label="Nenhuma"
            selected={equippedId === null && optOut}
            busy={saving === "none"}
            disabled={saving !== null}
            onClick={() => equip(null)}
          >
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground">
              {saving === "none" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
            </span>
          </FrameTile>

          {owned.map((entry) => (
            <FrameTile
              key={entry.slug}
              label={entry.name}
              title={
                entry.equipped
                  ? "Clique para remover"
                  : `Equipar ${entry.name} — ${entry.description}`
              }
              selected={entry.equipped}
              busy={saving === entry.itemId}
              // Toda moldura desta lista é possuída, e desde a migration
              // `20261125000000` posse implica equipável — a de VIP deixou de
              // ser o caso especial "sua, mas sem botão". `equippable` fica na
              // condição porque é ele que a rota exige; `itemId` nulo é a
              // moldura que existe em código mas não no banco.
              disabled={saving !== null || !entry.equippable || entry.itemId === null}
              onClick={() => entry.itemId && equip(entry.itemId)}
            >
              <ProfileAvatar
                name={name}
                avatarUrl={avatarUrl}
                size="lg"
                frameOverride={entry.frame}
              />
            </FrameTile>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-2.5">
          <button
            type="button"
            onClick={() => setShowLocked((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Lock className="size-3" />
              {locked.length} moldura{locked.length === 1 ? "" : "s"} para desbloquear
            </span>
            <span className="text-[11px] font-bold text-primary">
              {showLocked ? "Ocultar" : "Ver todas"}
            </span>
          </button>

          {showLocked && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {locked.map((entry) => {
                const copy = entry.lock ? LOCK_COPY[entry.lock] : null
                return (
                  <div key={entry.slug} className="flex flex-col items-center gap-1 text-center">
                    {/* Apagada, não escondida: ver a moldura que ainda não é
                        sua é o que dá vontade de alcançá-la. */}
                    <div className="opacity-40 saturate-50" title={entry.description}>
                      <ProfileAvatar
                        name={name}
                        avatarUrl={avatarUrl}
                        size="lg"
                        frameOverride={entry.frame}
                      />
                    </div>
                    <span className="text-[10px] font-semibold leading-tight text-muted-foreground">
                      {entry.name}
                    </span>
                    {/* O que falta, em número, quando dá para medir; senão o
                        rótulo do bloqueio ("Exclusiva do VIP"). */}
                    <span className="text-[9px] leading-none text-muted-foreground/70">
                      {entry.progressLabel ??
                        (entry.auraCost !== null ? `${entry.auraCost} de Aura` : copy?.label)}
                    </span>
                    {copy?.href && copy.cta && (
                      <Link
                        href={copy.href}
                        className="text-[9px] font-bold text-primary hover:underline"
                      >
                        {copy.cta}
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Um quadro clicável da grade de molduras possuídas — o mesmo gesto e o mesmo
 * feedback do seletor de Fundo de Mini Perfil (check verde no canto), para que
 * as duas escolhas de aparência do perfil se comportem igual.
 */
function FrameTile({
  label,
  title,
  selected,
  busy,
  disabled,
  onClick,
  children,
}: {
  label: string
  title?: string
  selected: boolean
  busy: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-colors disabled:cursor-default",
        selected
          ? "border-emerald-400/60 bg-emerald-400/5"
          : "border-transparent hover:border-border hover:bg-muted/30"
      )}
    >
      <span className="relative">
        {children}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Loader2 className="size-4 animate-spin text-white" />
          </span>
        )}
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[10px] font-semibold leading-tight",
          selected ? "text-emerald-300" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      {selected && (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[#04140d]">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}
