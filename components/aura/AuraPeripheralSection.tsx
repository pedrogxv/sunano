"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Keyboard, Loader2, Lock, PackageCheck } from "lucide-react"
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
import { shippingFormToPayload, type ShippingForm } from "@/components/store/ShippingAddressFields"
import type { PublicTrustSummary } from "@/lib/server/repositories/trust-repository"
import { TrustSeal } from "@/components/ui/TrustBadge"
import { AuraIcon } from "@/components/ui/AuraIcon"
import { PrizeLaneHeader } from "@/components/aura/PrizeLaneHeader"
import { TRUST_PHYSICAL_REDEEM_LEVEL, trustLevelLabel } from "@/lib/trust-factor"
import { storageImgProps } from "@/lib/storage-thumb"

interface AuraPeripheralSectionProps {
  /** Itens de kind `peripheral` vindos do catálogo. */
  items: AuraItem[]
  /** Donos de cada produto já resgatado, indexados por `item.id` (pode ter mais de um). */
  owners: Map<string, PeripheralOwnerEntry[]>
  balance: number
  isLoggedIn: boolean
  /** VIP ativo agora — 10% off no custo, igual ao resto da Central (a RPC desconta o real). */
  isVip: boolean
  /** Trust Factor da conta — trava o resgate (ver `can_redeem_physical_item`). */
  trust: PublicTrustSummary
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
 * "Esgotado" com quem levou, para todo mundo.
 *
 * A TRAVA é o Trust Factor: só quem está na faixa "Muito Bom" (ou acima) e
 * sem restrição ativa resgata — `can_redeem_physical_item` no banco é quem
 * decide de fato; aqui a tela só evita oferecer o que seria recusado. O card
 * fica visível para todos, com o botão travado e a faixa exigida explicada.
 *
 * Por que tão alto: é o item de maior valor real do site e o de maior
 * incentivo a fraude. Com o teto de maturidade (59/69/79), nenhuma conta com
 * menos de 90 dias alcança a faixa — a trava anti-multi-conta sai de graça.
 */
export function AuraPeripheralSection({
  items,
  owners,
  balance,
  isLoggedIn,
  isVip,
  trust,
  currentUserSlug,
  currentUserAvatarUrl,
  currentUserName,
  shippingPrefill,
  requireLogin,
  onRedeemed,
}: AuraPeripheralSectionProps) {
  if (items.length === 0) return null

  const canRedeemAny = trust.canRedeemPhysical

  // Frase da trava, curta: o painel grande de antes ocupava mais altura que
  // a fileira de produtos. A explicação inteira mora em /informacoes/trust-factor.
  const gateText = !isLoggedIn
    ? `Exige Trust "${trustLevelLabel(TRUST_PHYSICAL_REDEEM_LEVEL)}"`
    : canRedeemAny
      ? "Liberado para resgatar"
      : trust.status === "active"
        ? `Você: ${trustLevelLabel(trust.level)} · exige ${trustLevelLabel(TRUST_PHYSICAL_REDEEM_LEVEL)}`
        : "Conta em análise: resgate pausado"

  return (
    <div className="space-y-3">
      <PrizeLaneHeader
        icon={<AuraIcon size="sm" tone="inherit" />}
        iconClassName="bg-gradient-to-br from-amber-300 to-orange-600 text-[#1a0d00] shadow-[0_0_16px_-4px] shadow-orange-500/70"
        title="Resgate com Aura"
        tag={
          <>
            <Lock className="size-2.5" />
            Estoque limitado
          </>
        }
        tagClassName="bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
        right={
          // Trava do Trust Factor numa linha: "você está aqui" → "precisa
          // chegar aqui", com os mesmos selos em tamanho de rótulo. Deslogado
          // não tem faixa (o resumo padrão diria "Regular" ao visitante),
          // então só o selo exigido.
          <Link
            href="/informacoes/trust-factor"
            title="Como funciona o Trust Factor"
            className={cn(
              "group flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[11px] transition-colors",
              canRedeemAny
                ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200 hover:bg-emerald-500/10"
                : "border-amber-500/25 bg-amber-500/[0.06] text-amber-100 hover:bg-amber-500/10"
            )}
          >
            {isLoggedIn && <TrustSeal level={trust.level} status={trust.status} size="xs" showLabel={false} />}
            {isLoggedIn && !canRedeemAny && <ArrowRight className="size-3 shrink-0 opacity-50" />}
            {(!isLoggedIn || !canRedeemAny) && (
              <TrustSeal level={TRUST_PHYSICAL_REDEEM_LEVEL} size="xs" showLabel={false} />
            )}
            <span className="ml-0.5 font-medium">{gateText}</span>
          </Link>
        }
      />

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <AuraPeripheralCard
            key={item.id}
            item={item}
            owners={owners.get(item.id) ?? []}
            balance={balance}
            isLoggedIn={isLoggedIn}
            isVip={isVip}
            trust={trust}
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
  trust: PublicTrustSummary
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
  trust,
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
  const canRedeem = trust.canRedeemPhysical
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
        body: JSON.stringify(shippingFormToPayload(form)),
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

  const actionBase =
    "flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-bold transition-colors"

  // Horizontal: foto à esquerda, o resto em três linhas curtas à direita. O
  // card vertical (foto quadrada + nome + descrição + preço + dono + botão
  // empilhados) tinha quase 400px de altura para quatro informações.
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-xl border transition-all duration-200",
        done ? CARD_SURFACE : cn(CARD_SURFACE_INTERACTIVE, "hover:-translate-y-0.5")
      )}
    >
      <div className="relative w-24 shrink-0 bg-[var(--card-image-bg)] sm:w-28">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...storageImgProps(item.imageUrl, 128)}
            alt={item.name}
            className={cn(
              "absolute inset-0 size-full object-contain p-2",
              soldOut && !ownedByMe && "opacity-40 grayscale"
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Keyboard className="size-9 text-amber-500/50" strokeWidth={1.15} />
          </div>
        )}

        {ownedByMe ? (
          <span className="absolute left-1.5 top-1.5 z-[1] flex items-center gap-0.5 rounded bg-emerald-500/90 px-1 py-px text-[9px] font-bold text-[#04140d]">
            <Check className="size-2.5" strokeWidth={2.5} />
            Seu
          </span>
        ) : soldOut ? (
          <span className="absolute left-1.5 top-1.5 z-[1] rounded bg-slate-800/90 px-1 py-px text-[9px] font-bold text-slate-200">
            Esgotado
          </span>
        ) : (
          <span className="absolute left-1.5 top-1.5 z-[1] rounded bg-amber-500/90 px-1 py-px text-[9px] font-bold text-[#1a1200]">
            {unitsLeft} de {item.stock}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
        <h3 className="line-clamp-1 font-sans text-[13px] font-semibold leading-tight text-foreground" title={item.name}>
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-1 text-[10.5px] text-muted-foreground" title={item.description}>
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <div className="min-w-0 space-y-0.5">
            <AuraPriceTag listPrice={item.auraCost} isVip={isVip} priceClassName="text-base text-orange-400" />
            {claimedCount > 0 && <OwnersInline owners={owners} />}
          </div>

          {ownedByMe ? (
            <span className={cn(actionBase, "bg-emerald-400/10 text-emerald-300")}>
              <Check className="size-3" />
              Resgatado
            </span>
          ) : soldOut ? (
            <span className={cn(actionBase, "bg-muted/40 text-muted-foreground")}>
              <PackageCheck className="size-3" />
              Esgotado
            </span>
          ) : !isLoggedIn ? (
            <button
              type="button"
              onClick={() => requireLogin()}
              className={cn(actionBase, "bg-orange-500 text-[#1a1200] hover:bg-orange-400")}
            >
              Entrar
            </button>
          ) : !canRedeem ? (
            <span
              title={`Requer Trust Factor "${trustLevelLabel(TRUST_PHYSICAL_REDEEM_LEVEL)}"`}
              className={cn(actionBase, "cursor-not-allowed bg-muted/40 text-muted-foreground")}
            >
              <Lock className="size-3" />
              Trust
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={loading || !canAfford}
              title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
              className={cn(
                actionBase,
                canAfford
                  ? "bg-orange-500 text-[#1a1200] hover:bg-orange-400"
                  : "cursor-not-allowed bg-muted/40 text-muted-foreground"
              )}
            >
              {loading && <Loader2 className="size-3 animate-spin" />}
              {canAfford ? "Resgatar" : "Sem saldo"}
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

/**
 * "Resgatado por" em UMA linha: avatares empilhados + o nome (um dono) ou
 * "+N". Antes era um bloco com rótulo e caixa própria, a parte mais alta do card.
 * Avatar de 20px sem moldura: chip empilhado, a exceção prevista no AGENTS.md.
 */
function OwnersInline({ owners }: { owners: PeripheralOwnerEntry[] }) {
  const shown = owners.slice(0, 3)
  const extra = owners.length - shown.length
  const single = owners.length === 1 ? owners[0] : null

  if (single) return <OwnerChip owner={single} />

  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Resgatado por">
      <div className="flex -space-x-1.5">
        {shown.map((o, i) => (
          <span key={`${o.userId}-${i}`} className="rounded-full ring-2 ring-[var(--card)]" title={o.displayName}>
            <UserAvatar name={o.displayName} avatarUrl={o.avatarUrl} size={4} />
          </span>
        ))}
      </div>
      {extra > 0 && <span className="font-semibold">+{extra}</span>}
    </div>
  )
}

/** Chip de um único dono — vira link se o perfil ainda existe. */
function OwnerChip({ owner }: { owner: PeripheralOwnerEntry }) {
  const inner = (
    <>
      <UserAvatar name={owner.displayName} avatarUrl={owner.avatarUrl} size={4} />
      <span className="min-w-0 truncate">{owner.displayName}</span>
    </>
  )
  const base =
    "flex min-w-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground"

  return owner.displaySlug ? (
    <Link href={profilePath(owner.displaySlug)} className={cn(base, "transition-colors hover:text-foreground")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  )
}
