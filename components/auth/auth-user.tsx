"use client"

import Link from "next/link"
import { RouteLink } from "@/components/ui/route-link"
import { Bookmark, ChevronRight, Crown, Handshake, LayoutDashboard, LifeBuoy, LogIn, LogOut, MoreVertical, PackageSearch, QrCode, Settings, ShieldCheck } from "lucide-react"

import { useState } from "react"

import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { profileFrameOf } from "@/lib/profile-frames"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { signOutSafely } from "@/lib/client/supabase-auth"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useUserOrders, pendingPaymentHref } from "@/lib/hooks/use-user-orders"
import { formatBRL } from "@/lib/format"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { vipCtaLabel, vipCtaShortLabel } from "@/lib/vip-status"

/**
 * Atalho da grade do menu: ícone em pastilha e rótulo curto embaixo. TODO
 * destino do menu é um ladrilho (inclusive Tickets, Afiliados e Admin): a
 * lista de linhas embaixo da grade dava ao menu dois idiomas visuais.
 * `title` leva o nome completo, já que o rótulo é a versão curta.
 */
function QuickTile({
  href,
  icon: Icon,
  label,
  title,
  attention = false,
}: {
  href: string
  icon: React.ElementType
  label: string
  title?: string
  /** Ponto pulsante no canto: algo ali espera a pessoa (ex.: ticket respondido). */
  attention?: boolean
}) {
  return (
    <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
      <RouteLink
        href={href}
        title={title}
        className="group relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-xl bg-muted/30 px-1 py-2.5 text-center transition-all hover:-translate-y-px hover:bg-muted/60 focus:bg-muted/60 focus:text-foreground"
      >
        {attention && (
          <span className="absolute right-2 top-2 flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:hidden" />
            <span className="relative size-2 rounded-full bg-amber-500" />
          </span>
        )}
        <span className="flex size-8 items-center justify-center text-muted-foreground transition-colors group-hover:text-foreground group-focus:text-foreground">
          <Icon className="size-4" />
        </span>
        <span className="w-full truncate text-xs font-medium text-foreground">{label}</span>
      </RouteLink>
    </DropdownMenuItem>
  )
}

interface AuthUserProps {
  isCollapsed?: boolean
  /** "public" mostra "Meu Perfil" (vitrine pública) e "Configurações da conta" (/conta); "admin" mostra "Configurações" (/admin/settings). */
  variant?: "public" | "admin"
  /** "sidebar" (padrão) usa o layout de rodapé; "topbar" usa um avatar compacto no canto,
   *  com o menu abrindo para baixo. */
  layout?: "sidebar" | "topbar"
  /**
   * Itens extras só visíveis no mobile (`sm:hidden`), renderizados no topo do
   * menu — usado pela TopBar para recolher tema/Aura para dentro do avatar
   * no celular, já que lá a barra não tem espaço para um botão por função.
   */
  mobileExtraItems?: React.ReactNode
}

export function AuthUser({ isCollapsed = false, variant = "admin", layout = "sidebar", mobileExtraItems }: AuthUserProps) {
  const t = useT()
  const { user: authUser, pending } = useAuthUser()
  const { openLogin } = useAuthModal()
  const { pendingOrder } = useUserOrders()
  // `pending`, não `loading`: quando o snapshot da última sessão já semeou o
  // usuário (lib/client/auth-snapshot.ts) existe o que desenhar, e insistir no
  // esqueleto até a confirmação do servidor traria de volta o salto de 1–2s no
  // avatar e no selo VIP que o snapshot existe para remover.
  const ready = !pending
  const isAdmin = authUser?.isAdmin ?? false
  const isVip = authUser?.vip.isVip ?? false
  // Afiliados acompanha a manutenção da Loja (ver lib/server/auth/affiliate-access.ts).
  // Resolvido no servidor (ver /api/auth/me): manutenção desligada ou
  // liberação individual do "pacote Loja". Ler a env aqui não funcionaria —
  // no browser a variante sem NEXT_PUBLIC_ não existe.
  const showAffiliates = authUser?.canUseStore ?? false
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)
  // Só a topbar pública abre o modal; a sidebar de admin navega até o /login.
  const useModal = variant === "public" && layout === "topbar"
  const user = authUser ? { name: authUser.displayName, email: authUser.email, avatar: authUser.avatarUrl || "" } : null
  // A moldura da sessão em um objeto só: a topbar desenha a MESMA que o resto
  // do site. Montada uma vez porque três avatares desta tela a usam.
  const sessionFrame = profileFrameOf({
    equippedFrameSlug: authUser?.equippedFrameSlug,
    equippedFrameUrl: authUser?.equippedFrameUrl,
    accountTier: authUser?.accountTier,
    vipExpiresAt: authUser?.vipExpiresAt,
    isFounder: authUser?.isFounder,
    longestStreak: authUser?.longestStreak,
    frameOptOut: authUser?.frameOptOut,
  })
  // Vitrine pública do próprio usuário. `/perfil/[handle]` resolve UUID e
  // redireciona para o slug canônico quando existir (ver app/perfil/[handle]/page.tsx).
  const myProfileHref = authUser ? `/perfil/${authUser.id}` : "/perfil"

  if (!ready) {
    if (layout === "topbar") {
      return <Skeleton className="size-8 shrink-0 rounded-lg" />
    }
    return (
      <div
        className={cn(
          "flex items-center rounded-lg px-3 py-2.5",
          isCollapsed ? "justify-center px-0" : "gap-3"
        )}
      >
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        {!isCollapsed && (
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        )}
      </div>
    )
  }

  if (!user) {
    if (layout === "topbar") {
      const className =
        "animate-fade-in-up flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/70 text-sm font-medium text-foreground transition-all hover:bg-muted/40 sm:h-8 sm:w-auto sm:px-3"
      const content = (
        <>
          <LogIn className="size-[15px] text-primary" />
          {/* `sr-only` e não `hidden`: no celular o botão é só o ícone, e com
              `hidden` ele ficava sem nome acessível (Lighthouse). */}
          <span className="sr-only sm:not-sr-only">Login</span>
        </>
      )
      if (useModal) {
        return (
          <button type="button" onClick={() => openLogin()} className={className}>
            {content}
          </button>
        )
      }
      return (
        <Link href="/login" className={className}>
          {content}
        </Link>
      )
    }
    return (
      <RouteLink
        href="/login"
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground",
          isCollapsed && "justify-center px-0"
        )}
      >
        <LogIn className="size-[18px] shrink-0" />
        <span className={cn(isCollapsed && "hidden")}>Login</span>
      </RouteLink>
    )
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {layout === "topbar" ? (
          <button
            type="button"
            aria-label={user.name}
            className="animate-fade-in-up relative flex size-11 shrink-0 items-center justify-center rounded-lg transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:size-8"
          >
            {/* Mesmo componente (e mesma moldura) do avatar do perfil, do
                fórum e dos rankings — ver `components/ui/ProfileAvatar.tsx`.
                O anel VIP e a coroa vinham escritos à mão aqui; agora saem da
                moldura resolvida em `lib/profile-frames.ts`. */}
            <ProfileAvatar
              name={user.name}
              avatarUrl={user.avatar || null}
              size="sm"
              frame={sessionFrame}
            />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center rounded-lg px-3 py-2.5 transition-all hover:bg-muted/40",
              isCollapsed ? "justify-center px-0" : "gap-3"
            )}
          >
            <ProfileAvatar
              name={user.name}
              avatarUrl={user.avatar || null}
              size="sm"
              frame={sessionFrame}
            />
            {!isCollapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
                <MoreVertical className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={layout === "topbar" ? "bottom" : "top"}
        align="end"
        sideOffset={8}
        collisionPadding={12}
        // Largura fixa no desktop, mas nunca maior que a tela do celular; a
        // altura acompanha o espaço livre do Radix para o menu rolar em vez
        // de sair cortado em telas baixas (celular deitado).
        className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain rounded-2xl border-border bg-popover p-0 text-foreground shadow-2xl shadow-black/50"
      >
        {/* Cabeçalho: a identidade é o próprio atalho para a vitrine pública,
            então "Meu Perfil" deixou de ser uma linha solta da lista. */}
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -right-12 -top-20 size-48 rounded-full blur-3xl",
              isVip ? "bg-[var(--vip-accent-soft)] opacity-60" : "bg-foreground/[0.07]"
            )}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-foreground)_1px,transparent_0)] bg-[length:14px_14px] opacity-[0.04]"
          />
          <DropdownMenuItem asChild className="relative m-1.5 rounded-xl p-2.5 focus:bg-foreground/[0.06] focus:text-foreground">
            <RouteLink href={myProfileHref} className="group flex items-center gap-3">
              <ProfileAvatar name={user.name} avatarUrl={user.avatar || null} size="lg" frame={sessionFrame} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-display text-base font-bold leading-tight">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                <span className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground group-focus:text-foreground">
                  {t.auth.viewProfile}
                  <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </RouteLink>
          </DropdownMenuItem>

          {isVip ? (
            // Segue VIP (o período pago vale até o fim). Se cancelou dentro
            // dele, o selo vem acompanhado do convite a REATIVAR — mesmo
            // verbo da aba de assinatura, porque é a mesma ação e ela não
            // cobra nada agora. O rótulo sai de `vipCtaShortLabel`, nunca
            // escrito à mão aqui: era assim que este menu dizia "RENOVAR"
            // enquanto /conta dizia "Reativar assinatura".
            <div className="relative mx-3 mb-3 flex items-center gap-2.5 rounded-xl bg-[linear-gradient(110deg,oklch(0.75_0.19_320/0.16),transparent_70%)] px-3 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.75_0.19_320/0.18)]">
                <Crown className="size-3.5 vip-badge-crown" style={{ color: "var(--vip-accent)" }} />
              </span>
              <span className="vip-badge-text flex-1 text-xs font-bold uppercase tracking-wider">Membro VIP</span>
              {authUser?.vip.canReactivate && isVipSubscriptionEnabled() && (
                <button
                  type="button"
                  onClick={() => setVipUpsellOpen(true)}
                  className="shrink-0 rounded-full bg-[oklch(0.75_0.19_320/0.18)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors hover:bg-[oklch(0.75_0.19_320/0.28)]"
                  style={{ color: "var(--vip-accent)" }}
                >
                  {vipCtaShortLabel(authUser.vip)}
                </button>
              )}
            </div>
          ) : isVipSubscriptionEnabled() ? (
            <DropdownMenuItem
              onSelect={() => setVipUpsellOpen(true)}
              className="group relative mx-3 mb-3 gap-2.5 overflow-hidden rounded-xl bg-[linear-gradient(110deg,oklch(0.75_0.19_320/0.2),oklch(0.75_0.19_320/0.04)_75%)] px-3 py-2.5 focus:bg-[oklch(0.75_0.19_320/0.22)] focus:text-foreground"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.75_0.19_320/0.2)]">
                <Crown className="size-4 vip-badge-crown" style={{ color: "var(--vip-accent)" }} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="vip-badge-text text-xs font-bold uppercase tracking-wider">
                  {authUser ? vipCtaLabel(authUser.vip) ?? "Seja VIP" : "Seja VIP"}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">Benefícios exclusivos e apoio ao site</span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: "var(--vip-accent)" }}
              />
            </DropdownMenuItem>
          ) : null}
        </div>

        {variant === "public" && pendingOrder && (
          <div className="px-1.5 pb-1.5">
            <DropdownMenuItem asChild>
              <RouteLink
                href={pendingPaymentHref(pendingOrder)}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-amber-500/10 px-2.5 py-2 focus:bg-amber-500/20 focus:text-foreground"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                  <QrCode className="size-4 text-amber-400" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">Pedido aguardando pagamento</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatBRL(pendingOrder.total_cents)} ·{" "}
                    {pendingOrder.payment_method === "credit_card" ? "concluir com cartão" : "concluir com PIX"}
                  </span>
                </div>
              </RouteLink>
            </DropdownMenuItem>
          </div>
        )}

        {mobileExtraItems && <div className="px-1.5 pb-1.5 sm:hidden">{mobileExtraItems}</div>}

        {/* Uma grade só, 3 por linha: os três destinos de sempre e, depois,
            os condicionais (Tickets, Afiliados, Admin) no mesmo formato. */}
        <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
          {variant === "public" ? (
            <>
              <QuickTile href="/conta" icon={ShieldCheck} label={t.auth.accountShort} />
              <QuickTile href="/conta/pedidos" icon={PackageSearch} label={t.auth.ordersShort} />
              <QuickTile href="/forum/salvos" icon={Bookmark} label={t.auth.savedShort} />
              {authUser?.hasSupportTicket && (
                <QuickTile
                  href="/conta/suporte"
                  icon={LifeBuoy}
                  label={t.auth.ticketsShort}
                  title={t.auth.myTickets}
                  attention={Boolean(authUser.supportTicketsAwaitingMe)}
                />
              )}
              {showAffiliates && (
                <QuickTile href="/afiliados" icon={Handshake} label={t.auth.affiliatesShort} title={t.auth.affiliates} />
              )}
              {isAdmin && (
                <QuickTile href="/admin" icon={LayoutDashboard} label={t.auth.adminShort} title={t.auth.adminPanel} />
              )}
            </>
          ) : (
            <QuickTile href="/admin/settings" icon={Settings} label={t.auth.settings} />
          )}
        </div>

        {/* Sair sem divisória: separado pelo espaço e pelo tom, e só fica
            vermelho no hover (é ação de saída, não destino). */}
        <div className="px-2 pb-2">
          <DropdownMenuItem
            className="group justify-center gap-2 rounded-xl bg-muted/20 px-2.5 py-2 text-xs font-medium text-muted-foreground focus:bg-red-500/10 focus:text-red-300"
            onSelect={async () => {
              await signOutSafely()
              window.location.href = "/login"
            }}
          >
            <LogOut className="size-3.5 transition-transform group-focus:-translate-x-0.5" />
            {t.auth.signOut}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </>
  )
}
