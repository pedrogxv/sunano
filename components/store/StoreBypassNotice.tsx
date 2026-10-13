"use client"

import { ShieldAlert } from "lucide-react"
import { useAuthUser } from "@/components/providers/auth-context"

/**
 * Faixa no topo da Loja e do checkout quando a pessoa só está vendo a Loja
 * porque atravessa a manutenção (WEB MASTER ou `store_access`). Sem ela,
 * quem está do lado de dentro não tem como saber que o público vê
 * "Coming soon" — e um pedido de teste parece venda aberta.
 *
 * O estado vem resolvido do servidor (`storeMaintenanceBypass`, em
 * /api/auth/me): a env de manutenção não existe no browser.
 */
export function StoreBypassNotice() {
  const { user } = useAuthUser()
  if (!user?.storeMaintenanceBypass) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200"
    >
      <ShieldAlert className="size-4 shrink-0 text-amber-400" aria-hidden />
      <span>
        <strong className="font-semibold uppercase tracking-wide text-amber-300">
          {user.isWebMaster ? "Web Master special" : "Acesso antecipado"}
        </strong>
        {" — "}a Loja está fechada para o público. Só você está vendo esta página.
      </span>
    </div>
  )
}
