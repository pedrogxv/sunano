"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Keyboard, Loader2, Lock, PackageCheck } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { profilePath } from "@/lib/profile-name"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import type { PeripheralOwnerEntry } from "@/components/aura/AuraCenterContent"
import { AuraPriceTag } from "@/components/aura/AuraPriceTag"
import { PeripheralRedeemDialog, type PrefillShipping } from "@/components/aura/PeripheralRedeemDialog"
import type { ShippingForm } from "@/components/store/ShippingAddressFields"

interface AuraPeripheralSectionProps {
  /** Itens de kind `peripheral` vindos do catálogo. */
  items: AuraItem[]
  /** Donos de cada produto já resgatado, indexados por `item.id` (pode ter mais de um). */
  owners: Map<string, PeripheralOwnerEntry[]>
  balance: number
  isLoggedIn: boolean
  /** VIP ativo agora — 10% off no custo, igual ao resto da Central (a RPC desconta o real). */
  isVip: boolean
  trustTier: "new" | "normal" | "verified"
  currentUserSlug: string | null
  currentUserAvatarUrl: string | null
  currentUserName: string
  /** Último endereço de entrega conhecido do usuário, para pré-preencher o resgate. */
  shippingPrefill: PrefillShipping
  requireLogin: () => boolean
  onRedeemed: (itemId: string, cost: number, owner: PeripheralOwnerEntry) => void
}

/**
 * Seção "Produtos" da Central de Aura.
 *
 * O prêmio mais especial da Central: item FÍSICO, com ESTOQUE limitado. Cada
 * pessoa resgata no máximo 1 unidade; quando as unidades acabam o card vira
 * "Esgotado" com quem levou, para todo mundo. Só quem é nível `verified`
 * (`get_giver_trust_tier`) pode resgatar — o card fica visível para todos, mas
 * o botão trava para os demais.
 */
export function AuraPeripheralSection({
  items,
  owners,
  balance,
  isLoggedIn,
  isVip,
  trustTier,
  currentUserSlug,
  currentUserAvatarUrl,
  currentUserName,
  shippingPrefill,
  requireLogin,
  onRedeemed,
}: AuraPeripheralSectionProps) {
  if (items.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Produtos</h2>
        <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
          <Lock className="size-2.5" />
          Estoque limitado · precisa ser nível verificado
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Prêmios físicos resgatáveis com Aura. Cada um tem poucas unidades: quando acabam, o
        produto continua aqui marcado como esgotado, com o perfil de quem levou. Uma unidade por pessoa.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <AuraPeripheralCard
            key={item.id}
            item={item}
            owners={owners.get(item.id) ?? []}
            balance={balance}
            isLoggedIn={isLoggedIn}
            isVip={isVip}
            trustTier={trustTier}
            currentUserSlug={currentUserSlug}
            currentUserAvatarUrl={currentUserAvatarUrl}
            currentUserName={currentUserName}
            shippingPrefill={shippingPrefill}
            requireLogin={requireLogin}
            onRedeemed={(cost, owner) => onRedeemed(item.id, cost, owner)}
          />
        ))}
      </div>
    </div>
  )
}

interface AuraPeripheralCardProps {
  item: AuraItem
  owners: PeripheralOwnerEntry[]
  balance: number
  isLoggedIn: boolean
  isVip: boolean
  trustTier: "new" | "normal" | "verified"
  currentUserSlug: string | null
  currentUserAvatarUrl: string | null
  currentUserName: string
  shippingPrefill: PrefillShipping
  requireLogin: () => boolean
  onRedeemed: (cost: number, owner: PeripheralOwnerEntry) => void
}

function AuraPeripheralCard({
  item,
  owners,
  balance,
  isLoggedIn,
  isVip,
  trustTier,
  currentUserSlug,
  currentUserAvatarUrl,
  currentUserName,
  shippingPrefill,
  requireLogin,
  onRedeemed,
}: AuraPeripheralCardProps) {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const claimedCount = owners.length
  const unitsLeft = Math.max(item.stock - claimedCount, 0)
  const soldOut = unitsLeft <= 0
  // "me" é o userId sintético que o card cria ao resgatar sem F5; slug é a rede
  // pro estado vindo do server (onde o userId real ainda não é conhecido aqui).
  const ownedByMe = owners.some(
    (o) => o.userId === "me" || (currentUserSlug !== null && o.displaySlug === currentUserSlug)
  )
  const isVerified = trustTier === "verified"
  // Preço com o desconto VIP já aplicado — a RPC desconta o valor real; aqui é
  // só prévia. Afford e custo otimista usam o `finalPrice`.
  const price = auraPriceForVip(item.auraCost, isVip)
  const canAfford = balance >= price.finalPrice

  async function handleRedeem(form: ShippingForm) {
    setLoading(true)
    try {
      const res = await fetch(`/api/aura/items/${item.id}/redeem-peripheral`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingRecipient: form.recipient.trim(),
          shippingPhone: form.phone.replace(/\D/g, ""),
          shippingPostalCode: form.postalCode.replace(/\D/g, ""),
          shippingStreet: form.street.trim(),
          shippingNumber: form.number.trim(),
          shippingComplement: form.complement.trim() || undefined,
          shippingNeighborhood: form.neighborhood.trim(),
          shippingCity: form.city.trim(),
          shippingState: form.state.trim().toUpperCase(),
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; orderId?: string | null }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao resgatar o produto")
      }
      toast.success("Produto resgatado!", {
        description: `${item.name} · acompanhe o envio em Meus Pedidos`,
        action: { label: "Ver pedido", onClick: () => window.location.assign("/conta/pedidos") },
      })
      setConfirmOpen(false)
      onRedeemed(price.finalPrice, {
        userId: "me",
        displayName: currentUserName?.trim() || "Você",
        displaySlug: currentUserSlug,
        avatarUrl: currentUserAvatarUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao resgatar o produto"
      toast.error("Erro ao resgatar", { description: message })
    } finally {
      setLoading(false)
    }
  }

  const done = ownedByMe || soldOut

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border transition-all duration-200",
        done ? CARD_SURFACE : cn(CARD_SURFACE_INTERACTIVE, "hover:-translate-y-1")
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--card-image-bg)]">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className={cn("h-full w-full object-contain p-3", soldOut && !ownedByMe && "opacity-40 grayscale")}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Keyboard className="size-14 text-amber-500/50" strokeWidth={1.15} />
          </div>
        )}

        {ownedByMe ? (
          <span className="absolute left-2 top-2 z-[1] flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-bold text-[#04140d]">
            <Check className="size-2.5" strokeWidth={2.5} />
            Você resgatou
          </span>
        ) : soldOut ? (
          <span className="absolute left-2 top-2 z-[1] flex items-center gap-1 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-200">
            <PackageCheck className="size-2.5" strokeWidth={2.5} />
            Esgotado
          </span>
        ) : (
          <span className="absolute left-2 top-2 z-[1] rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-[#1a1200]">
            {unitsLeft} de {item.stock}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-2 font-sans text-[12.5px] font-semibold leading-[1.3] text-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-2 text-[10px] font-medium text-muted-foreground">{item.description}</p>
        )}

        <div className="mt-auto space-y-2 pt-1">
          <AuraPriceTag listPrice={item.auraCost} isVip={isVip} />

          {claimedCount > 0 && <OwnersRow owners={owners} />}

          {ownedByMe ? (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
              <Check className="size-3" />
              Resgatado
            </div>
          ) : soldOut ? (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
              <PackageCheck className="size-3" />
              Esgotado
            </div>
          ) : !isLoggedIn ? (
            <button
              type="button"
              onClick={() => requireLogin()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-bold text-[#1a1200] transition-colors hover:bg-orange-400"
            >
              Entrar para resgatar
            </button>
          ) : !isVerified ? (
            <div className="space-y-1">
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground"
              >
                <Lock className="size-3" />
                Nível verificado
              </button>
              <p className="text-[9px] leading-snug text-muted-foreground/70">
                Confirme o Discord ou o YouTube, seja VIP, ou tenha 14+ dias de conta.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={loading || !canAfford}
              title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors",
                canAfford
                  ? "bg-orange-500 text-[#1a1200] hover:bg-orange-400"
                  : "cursor-not-allowed bg-muted/40 text-muted-foreground"
              )}
            >
              {loading && <Loader2 className="size-3 animate-spin" />}
              {canAfford ? "Resgatar" : "Saldo insuficiente"}
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <PeripheralRedeemDialog
          onOpenChange={setConfirmOpen}
          itemName={item.name}
          listPrice={item.auraCost}
          isVip={isVip}
          balance={balance}
          loading={loading}
          prefill={shippingPrefill}
          onConfirm={handleRedeem}
        />
      )}
    </div>
  )
}

/** Linha "resgatado por" — avatares empilhados, com "+N" quando passa de 3. */
function OwnersRow({ owners }: { owners: PeripheralOwnerEntry[] }) {
  const shown = owners.slice(0, 3)
  const extra = owners.length - shown.length
  const single = owners.length === 1 ? owners[0] : null

  return (
    <div className="space-y-1">
      <p className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground/60">
        {owners.length === 1 ? "Resgatado por" : `Resgatado por ${owners.length}`}
      </p>
      {single ? (
        <OwnerChip owner={single} />
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1.5">
          <div className="flex -space-x-2">
            {shown.map((o, i) => (
              <span
                key={`${o.userId}-${i}`}
                className="rounded-full ring-2 ring-[var(--card)]"
                title={o.displayName}
              >
                <UserAvatar name={o.displayName} avatarUrl={o.avatarUrl} size={5} />
              </span>
            ))}
          </div>
          {extra > 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground">+{extra}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Chip de um único dono — vira link se o perfil ainda existe. */
function OwnerChip({ owner }: { owner: PeripheralOwnerEntry }) {
  const inner = (
    <>
      <UserAvatar name={owner.displayName} avatarUrl={owner.avatarUrl} size={5} />
      <span className="min-w-0 flex-1 truncate">{owner.displayName}</span>
    </>
  )
  const base =
    "flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[10.5px] font-semibold text-foreground"

  return owner.displaySlug ? (
    <Link href={profilePath(owner.displaySlug)} className={cn(base, "transition-colors hover:bg-muted/50")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  )
}
