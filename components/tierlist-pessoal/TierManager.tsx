"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Loader2, Palette, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CARD_SURFACE } from "@/lib/ui-styles"
import {
  TIERLIST_MAX_TIERS,
  TIERLIST_MIN_TIERS,
  TIERLIST_TIER_LABEL_MAX_LENGTH,
  type TierlistTierDef,
} from "@/lib/personal-tierlist"
import { sortTiers } from "@/lib/personal-tierlist-theme"

/** Paleta de sugestão no popover de cor — o `<input type="color">` nativo cobre qualquer hex além destas. */
const COLOR_PRESETS = [
  "#F97316", "#F59E0B", "#EAB308", "#22C55E", "#10B981",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
  "#EF4444", "#6B7280",
]

let tempIdCounter = 0
/** Chave de UI pra tiers ainda sem id do servidor (recém-adicionados) — nunca enviada pra API. */
function tempId() {
  tempIdCounter += 1
  return `temp-${tempIdCounter}`
}

/**
 * Painel de personalização dos tiers: renomear, trocar cor, reordenar,
 * adicionar (até `TIERLIST_MAX_TIERS`) e remover (até `TIERLIST_MIN_TIERS`).
 *
 * Cada ação salva na hora (`PUT /api/perfil/tierlist/tiers` com o conjunto
 * inteiro) e desfaz o estado local se o servidor recusar — mesma filosofia
 * otimista do `PersonalTierlistEditor` pros itens. Como os itens referenciam
 * o tier por id (não por posição), reordenar/renomear/recolorir nunca precisa
 * tocar em `user_tierlist_items` — só apagar um tier com item dentro é que a
 * API barra (o dono precisa esvaziar o tier antes).
 */
export function TierManager({
  tiers,
  itemCountByTierId,
  onTiersChange,
}: {
  tiers: TierlistTierDef[]
  /** Quantos itens cada tier tem — barra a remoção sem round-trip quando o tier não está vazio. */
  itemCountByTierId: Map<string, number>
  onTiersChange: (tiers: TierlistTierDef[]) => void
}) {
  const [pendingCount, setPendingCount] = useState(0)
  const ordered = sortTiers(tiers)

  /**
   * A ordem do array É a ordem final (a API grava `position` pelo índice),
   * então o `position` de cada tier tem que ser reescrito antes de subir pro
   * estado. Sem isso o `sortTiers` seguinte reordena pelas posições velhas e
   * desfaz na tela o movimento que acabou de ser feito — a linha só pulava de
   * lugar quando o servidor respondia.
   */
  function reindex(list: TierlistTierDef[]): TierlistTierDef[] {
    return list.map((tier, index) => ({ ...tier, position: index }))
  }

  // Espelho síncrono do estado. `tiers` (prop) só chega no próximo render, e
  // duas ações disparadas no mesmo instante precisam enxergar uma a outra.
  const liveRef = useRef(ordered)
  liveRef.current = ordered
  /** Último conjunto que o servidor confirmou — destino do rollback. */
  const confirmedRef = useRef(ordered)
  /** Fila: uma escrita por vez (ver `persist`). */
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  /**
   * Último rótulo confirmado de cada tier, para o campo poder voltar atrás
   * quando o dono apaga o texto e sai do input.
   */
  const savedLabels = useRef(new Map<string, string>())
  useEffect(() => {
    if (pendingCount > 0) return
    confirmedRef.current = ordered
    savedLabels.current = new Map(ordered.map((t) => [t.id, t.label]))
    // `ordered` é recalculado a cada render; `tiers` é a identidade estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers, pendingCount])

  /**
   * Aplica uma mudança e a envia — as escritas são **serializadas**.
   *
   * `apply` recebe o estado corrente e devolve o novo, em vez de o chamador
   * passar um array pronto: quando duas ações se atropelam (clicar duas cores
   * seguidas, ou adicionar um tier e renomear outro antes da resposta), a
   * segunda só é montada depois que a primeira respondeu, já em cima dos ids
   * reais. Com snapshots prontos, a segunda ainda carregaria o `temp-` da
   * primeira e o servidor criaria o tier duas vezes.
   */
  function persist(
    apply: (current: TierlistTierDef[]) => TierlistTierDef[],
    fallbackMessage: string
  ) {
    setPendingCount((c) => c + 1)

    // Otimista na hora, pra tela não esperar o round-trip.
    const optimistic = reindex(apply(liveRef.current))
    liveRef.current = optimistic
    onTiersChange(optimistic)

    chainRef.current = chainRef.current.then(async () => {
      // Recalculado agora, sobre o que o servidor já confirmou.
      const next = reindex(apply(confirmedRef.current))
      try {
        const res = await fetch("/api/perfil/tierlist/tiers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tiers: next.map((t) => ({
              id: t.id.startsWith("temp-") ? undefined : t.id,
              label: t.label,
              color: t.color,
            })),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? fallbackMessage)

        const confirmed = sortTiers(data.tiers as TierlistTierDef[])
        confirmedRef.current = confirmed
        liveRef.current = confirmed
        onTiersChange(confirmed)
      } catch (err) {
        liveRef.current = confirmedRef.current
        onTiersChange(confirmedRef.current)
        toast.error(err instanceof Error ? err.message : fallbackMessage)
      } finally {
        setPendingCount((c) => c - 1)
      }
    })
  }

  function updateLabel(id: string, label: string) {
    onTiersChange(ordered.map((t) => (t.id === id ? { ...t, label } : t)))
  }

  function commitLabel(id: string) {
    const tier = ordered.find((t) => t.id === id)
    if (!tier) return
    const trimmed = tier.label.trim()

    // Nome vazio não vai pro servidor: restaura o último rótulo salvo
    // (`savedLabels`). Antes isto reemitia o próprio estado atual, que já
    // continha o texto apagado — o campo ficava vazio na tela e divergia do
    // que estava no banco até um reload.
    if (trimmed.length === 0) {
      const saved = savedLabels.current.get(id)
      if (saved === undefined) return
      onTiersChange(ordered.map((t) => (t.id === id ? { ...t, label: saved } : t)))
      return
    }

    // Blur sem edição nenhuma não merece um PUT.
    if (trimmed === savedLabels.current.get(id)) {
      if (trimmed !== tier.label) onTiersChange(ordered.map((t) => (t.id === id ? { ...t, label: trimmed } : t)))
      return
    }

    persist(
      (current) => current.map((t) => (t.id === id ? { ...t, label: trimmed } : t)),
      "Não foi possível renomear o tier."
    )
  }

  function updateColor(id: string, color: string) {
    persist(
      (current) => current.map((t) => (t.id === id ? { ...t, color } : t)),
      "Não foi possível trocar a cor do tier."
    )
  }

  function move(id: string, direction: -1 | 1) {
    const index = ordered.findIndex((t) => t.id === id)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= ordered.length) return

    persist((current) => {
      const from = current.findIndex((t) => t.id === id)
      const to = from + direction
      if (from === -1 || to < 0 || to >= current.length) return current
      const next = [...current]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    }, "Não foi possível reordenar os tiers.")
  }

  function addTier() {
    if (ordered.length >= TIERLIST_MAX_TIERS) return
    const usedColors = new Set(ordered.map((t) => t.color.toUpperCase()))
    const color = COLOR_PRESETS.find((c) => !usedColors.has(c)) ?? COLOR_PRESETS[0]
    const id = tempId()
    persist(
      (current) =>
        current.length >= TIERLIST_MAX_TIERS
          ? current
          : [...current, { id, label: "Novo", color, position: current.length }],
      "Não foi possível adicionar o tier."
    )
  }

  function removeTier(id: string) {
    if (ordered.length <= TIERLIST_MIN_TIERS) return
    const tier = ordered.find((t) => t.id === id)
    if ((itemCountByTierId.get(id) ?? 0) > 0) {
      toast.error(`Mova ou remova os itens do tier "${tier?.label ?? ""}" antes de apagá-lo.`)
      return
    }
    persist(
      (current) => (current.length <= TIERLIST_MIN_TIERS ? current : current.filter((t) => t.id !== id)),
      "Não foi possível remover o tier."
    )
  }

  return (
    <div className={cn("space-y-2 rounded-xl border p-3", CARD_SURFACE)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Palette className="size-3.5 text-muted-foreground" />
          Personalizar tiers
        </p>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Salvando...
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {ordered.map((tier, index) => (
          <div key={tier.id} className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Cor do tier ${tier.label}`}
                  className="size-7 shrink-0 rounded-md border border-border/60 transition-transform hover:scale-110"
                  style={{ backgroundColor: tier.color }}
                />
              </PopoverTrigger>
              <PopoverContent className="w-56 space-y-2 border-border bg-popover p-3" align="start">
                <div className="grid grid-cols-6 gap-1.5">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      onClick={() => updateColor(tier.id, color)}
                      className={cn(
                        "size-6 rounded-md border transition-transform hover:scale-110",
                        tier.color.toUpperCase() === color ? "border-foreground ring-1 ring-foreground" : "border-border/60"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  Cor livre
                  <input
                    type="color"
                    value={tier.color}
                    onChange={(e) => updateColor(tier.id, e.target.value)}
                    className="h-6 w-10 cursor-pointer rounded border border-border/60 bg-transparent"
                  />
                </label>
              </PopoverContent>
            </Popover>

            <Input
              value={tier.label}
              onChange={(e) => updateLabel(tier.id, e.target.value.slice(0, TIERLIST_TIER_LABEL_MAX_LENGTH))}
              onBlur={() => commitLabel(tier.id)}
              maxLength={TIERLIST_TIER_LABEL_MAX_LENGTH}
              className="h-8 flex-1 text-xs"
            />

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label="Mover pra cima"
                disabled={index === 0}
                onClick={() => move(tier.id, -1)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Mover pra baixo"
                disabled={index === ordered.length - 1}
                onClick={() => move(tier.id, 1)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remover tier ${tier.label}`}
                disabled={ordered.length <= TIERLIST_MIN_TIERS || (itemCountByTierId.get(tier.id) ?? 0) > 0}
                title={
                  ordered.length <= TIERLIST_MIN_TIERS
                    ? `Mínimo de ${TIERLIST_MIN_TIERS} tiers`
                    : (itemCountByTierId.get(tier.id) ?? 0) > 0
                      ? "Esvazie o tier antes de remover"
                      : "Remover tier"
                }
                onClick={() => removeTier(tier.id)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addTier}
        disabled={ordered.length >= TIERLIST_MAX_TIERS}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        {ordered.length >= TIERLIST_MAX_TIERS
          ? `Máximo de ${TIERLIST_MAX_TIERS} tiers`
          : "Adicionar tier"}
      </button>
    </div>
  )
}
