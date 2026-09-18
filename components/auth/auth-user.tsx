"use client"

import Link from "next/link"
import { Bookmark, Crown, Handshake, LayoutDashboard, LifeBuoy, LogIn, LogOut, MoreVertical, PackageSearch, QrCode, Settings, ShieldCheck, User } from "lucide-react"

import { useState } from "react"

import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { profileFrameOf } from "@/lib/profile-frames"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

interface AuthUserProps {
  isCollapsed?: boolean
  /** Para onde mandar ao logar/deslogar. Sidebar pública usa "/login"; admin, "/admin/login". */
  loginHref?: string
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

export function AuthUser({ isCollapsed = false, loginHref = "/admin/login", variant = "admin", layout = "sidebar", mobileExtraItems }: AuthUserProps) {
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
  // Afiliados acompanha a manutenção da Loja (ver lib/server/auth/affiliate-access.ts).
  // Resolvido no servidor (ver /api/auth/me): manutenção desligada ou
  // liberação individual do "pacote Loja". Ler a env aqui não funcionaria —
  // no browser a variante sem NEXT_PUBLIC_ não existe.
  const showAffiliates = authUser?.canUseStore ?? false
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)
  // Só a topbar pública abre o modal — a sidebar de admin (/admin/login) segue
  // navegando de verdade, já que aquele login não é o alvo deste modal.
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
          <span className="hidden sm:inline">Login</span>
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
        <Link href={loginHref} className={className}>
          {content}
        </Link>
      )
    }
    return (
      <Link
        href={loginHref}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground",
          isCollapsed && "justify-center px-0"
        )}
      >
        <LogIn className="size-[18px] shrink-0" />
        <span className={cn(isCollapsed && "hidden")}>Login</span>
      </Link>
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
        className="w-56 border-border bg-popover text-foreground shadow-xl"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2.5 px-2 py-2.5">
            <ProfileAvatar
              name={user.name}
              avatarUrl={user.avatar || null}
              size="sm"
              frame={sessionFrame}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
          {authUser?.vip.isVip ? (
            // Segue VIP (o período pago vale até o fim). Se cancelou dentro
            // dele, o selo vem acompanhado do convite a REATIVAR — mesmo
            // verbo da aba de assinatura, porque é a mesma ação e ela não
            // cobra nada agora. O rótulo sai de `vipCtaShortLabel`, nunca
            // escrito à mão aqui: era assim que este menu dizia "RENOVAR"
            // enquanto /conta dizia "Reativar assinatura".
            <div className="flex items-center gap-2 px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <Crown className="size-3 vip-badge-crown" style={{ color: "var(--vip-accent)" }} />
                <span className="vip-badge-text text-[10px] font-bold uppercase tracking-wide">VIP</span>
              </div>
              {authUser.vip.canReactivate && isVipSubscriptionEnabled() && (
                <button
                  type="button"
                  onClick={() => setVipUpsellOpen(true)}
                  className="text-[10px] font-bold uppercase tracking-wide underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: "var(--vip-accent)" }}
                >
                  {vipCtaShortLabel(authUser.vip)}
                </button>
              )}
            </div>
          ) : isVipSubscriptionEnabled() ? (
            <button
              type="button"
              onClick={() => setVipUpsellOpen(true)}
              className="flex items-center gap-1 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
              style={{ color: "var(--vip-accent)" }}
            >
              <Crown className="size-3" />
              {authUser ? vipCtaLabel(authUser.vip) ?? "Seja VIP" : "Seja VIP"}
            </button>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-border" />

        {variant === "public" && pendingOrder && (
          <>
            <DropdownMenuItem asChild>
              <Link
                href={pendingPaymentHref(pendingOrder)}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm bg-amber-500/10 focus:bg-amber-500/20 focus:text-foreground"
              >
                <QrCode className="size-4 shrink-0 text-amber-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">Pedido aguardando pagamento</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(pendingOrder.total_cents)} ·{" "}
                    {pendingOrder.payment_method === "credit_card" ? "concluir com cartão" : "concluir com PIX"}
                  </span>
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
          </>
        )}

        {mobileExtraItems && (
          <>
            <div className="sm:hidden">{mobileExtraItems}</div>
            <DropdownMenuSeparator className="bg-border sm:hidden" />
          </>
        )}

        {variant === "public" ? (
          <>
            <DropdownMenuItem asChild>
              <Link
                href={myProfileHref}
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <User className="size-4 text-muted-foreground" />
                {t.auth.myProfile}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/conta"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <ShieldCheck className="size-4 text-muted-foreground" />
                {t.auth.accountSettings}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/conta/pedidos"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <PackageSearch className="size-4 text-muted-foreground" />
                {t.auth.myOrders}
              </Link>
            </DropdownMenuItem>
            {authUser?.hasSupportTicket && (
              <DropdownMenuItem asChild>
                <Link
                  href="/conta/suporte"
                  className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
                >
                  <LifeBuoy className="size-4 text-muted-foreground" />
                  <span className="flex-1">{t.auth.myTickets}</span>
                  {Boolean(authUser.supportTicketsAwaitingMe) && (
                    <span className="size-2 shrink-0 rounded-full bg-amber-500" />
                  )}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link
                href="/forum/salvos"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <Bookmark className="size-4 text-muted-foreground" />
                {t.auth.savedPosts}
              </Link>
            </DropdownMenuItem>
            {showAffiliates && (
              <DropdownMenuItem asChild>
                <Link
                  href="/afiliados"
                  className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
                >
                  <Handshake className="size-4 text-muted-foreground" />
                  {t.auth.affiliates}
                </Link>
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link
                  href="/admin"
                  className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
                >
                  <LayoutDashboard className="size-4 text-muted-foreground" />
                  {t.auth.adminPanel}
                </Link>
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link
                href={myProfileHref}
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <User className="size-4 text-muted-foreground" />
                {t.auth.myProfile}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/admin/settings"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <Settings className="size-4 text-muted-foreground" />
                {t.auth.settings}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem
          className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-300"
          onSelect={async () => {
            await signOutSafely()
            window.location.href = loginHref
          }}
        >
          <LogOut className="size-4" />
          {t.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </>
  )
}
