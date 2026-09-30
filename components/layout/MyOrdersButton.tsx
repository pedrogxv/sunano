"use client"

import { RouteLink } from "@/components/ui/route-link"
import { usePathname } from "next/navigation"
import { PackageSearch } from "lucide-react"
import { useAuthUser } from "@/components/providers/auth-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

/**
 * Atalho para /conta/pedidos na TopBar. O mesmo link já existe no menu do
 * avatar, mas lá ele fica a dois cliques; quem acabou de comprar volta ao
 * site procurando o pedido no topo, ao lado do sino. Só para quem está logado:
 * deslogado não tem pedido, e o link cairia na tela de login.
 */
export function MyOrdersButton() {
  const { user } = useAuthUser()
  const pathname = usePathname()
  const t = useT()

  if (!user) return null

  const active = pathname?.startsWith("/conta/pedidos")

  return (
    <RouteLink
      href="/conta/pedidos"
      aria-label={t.auth.myOrders}
      title={t.auth.myOrders}
      className={cn(
        "animate-fade-in-up flex size-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card/70 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground sm:h-8 sm:w-auto sm:px-3",
        active && "bg-muted/40 text-foreground"
      )}
    >
      <PackageSearch className="size-[15px]" />
      <span className="hidden text-xs lg:inline">{t.auth.myOrders}</span>
    </RouteLink>
  )
}
