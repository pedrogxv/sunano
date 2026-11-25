"use client"

import { RouteLink } from "@/components/ui/route-link"
import { usePathname } from "@/lib/hooks/use-pathname"
import { PackageSearch } from "lucide-react"
import { useAuthUser } from "@/components/providers/auth-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { TOPBAR_BUTTON_ACTIVE, TOPBAR_LABEL_BUTTON } from "@/components/layout/topbar-styles"

/**
 * Atalho para /conta/pedidos na TopBar. O mesmo link já existe no menu do
 * avatar, mas lá ele fica a dois cliques; quem acabou de comprar volta ao
 * site procurando o pedido no topo, ao lado do sino. Só para quem está logado:
 * deslogado não tem pedido, e o link cairia na tela de login.
 *
 * O badge conta os pedidos que esperam a PESSOA (endereço faltando, resposta
 * da equipe na conversa do pedido ou aviso da loja pedindo correção), vindo
 * da sessão (`ordersNeedingAttention`) — sem polling próprio. A página de pedidos
 * mostra, no card de cada um, o que falta.
 */
export function MyOrdersButton() {
  const { user } = useAuthUser()
  const pathname = usePathname()
  const t = useT()

  if (!user) return null

  const active = pathname?.startsWith("/conta/pedidos")
  const pending = user.ordersNeedingAttention
  const label = pending > 0 ? `${t.auth.myOrders} · ${t.auth.myOrdersPending(pending)}` : t.auth.myOrders

  return (
    <RouteLink
      href="/conta/pedidos"
      aria-label={label}
      title={label}
      className={cn(
        "animate-fade-in-up",
        TOPBAR_LABEL_BUTTON,
        "md:px-2.5 lg:px-3",
        active && TOPBAR_BUTTON_ACTIVE
      )}
    >
      <PackageSearch className="size-[17px] md:size-[15px]" />
      <span className="hidden lg:inline">{t.auth.myOrders}</span>
      {/* Texto curto em vez de número solto: "9+" no canto não dizia o que
          era. No desktop vira pílula ao lado do rótulo; no mobile o botão é
          só ícone e não cabe texto, então fica o ponto. A contagem vai no
          `title`/`aria-label`. */}
      {pending > 0 && (
        <>
          <span
            aria-hidden
            className="hidden items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-400 lg:inline-flex"
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
            {t.auth.myOrdersAttention}
          </span>
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-[#141416] lg:hidden"
          />
        </>
      )}
    </RouteLink>
  )
}
