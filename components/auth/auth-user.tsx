"use client"

import Link from "next/link"
import { Bookmark, LayoutDashboard, LogIn, LogOut, MoreVertical, PackageSearch, QrCode, Settings, ShieldCheck, User } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { useUserOrders } from "@/lib/hooks/use-user-orders"
import { formatBRL } from "@/lib/format"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

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
  const { user: authUser, loading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const { pendingOrder } = useUserOrders()
  const ready = !loading
  const isAdmin = authUser?.isAdmin ?? false
  // Só a topbar pública abre o modal — a sidebar de admin (/admin/login) segue
  // navegando de verdade, já que aquele login não é o alvo deste modal.
  const useModal = variant === "public" && layout === "topbar"
  const user = authUser ? { name: authUser.displayName, email: authUser.email, avatar: authUser.avatarUrl || "" } : null
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

  const initials = getInitials(user.name)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {layout === "topbar" ? (
          <button
            type="button"
            aria-label={user.name}
            className="animate-fade-in-up flex size-11 shrink-0 items-center justify-center rounded-lg transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:size-8"
          >
            <Avatar className="size-8 rounded-lg ring-1 ring-border">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center rounded-lg px-3 py-2.5 transition-all hover:bg-muted/40",
              isCollapsed ? "justify-center px-0" : "gap-3"
            )}
          >
            <Avatar className="size-8 shrink-0 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
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
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-border" />

        {variant === "public" && pendingOrder && (
          <>
            <DropdownMenuItem asChild>
              <Link
                href={`/checkout/pix?orderId=${pendingOrder.id}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm bg-amber-500/10 focus:bg-amber-500/20 focus:text-foreground"
              >
                <QrCode className="size-4 shrink-0 text-amber-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">Pedido aguardando pagamento</span>
                  <span className="text-xs text-muted-foreground">{formatBRL(pendingOrder.total_cents)} · concluir com PIX</span>
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
            <DropdownMenuItem asChild>
              <Link
                href="/forum/salvos"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <Bookmark className="size-4 text-muted-foreground" />
                {t.auth.savedPosts}
              </Link>
            </DropdownMenuItem>
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
  )
}
