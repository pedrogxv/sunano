"use client"

import { RouteLink } from "@/components/ui/route-link"
import { usePathname } from "next/navigation"
import { LifeBuoy } from "lucide-react"
import { useAuthUser } from "@/components/providers/auth-context"
import { useT } from "@/lib/use-t"

/**
 * Botão flutuante de suporte no canto inferior direito das páginas públicas.
 * Antes o único caminho para /suporte era o menu da Loja, e quem tinha
 * problema com a conta ou um pedido estando na Home ou no Fórum não achava.
 *
 * Com resposta da equipe esperando, leva direto para os chamados (e mostra o
 * ponto âmbar, o mesmo do menu do avatar); senão, para abrir um novo.
 *
 * z-40 de propósito: barras que ocupam o rodapé (cookies, comparação de
 * periféricos) são z-50 e ficam por cima, em vez de o botão tapar a ação delas.
 */
export function SupportFab() {
  const pathname = usePathname() ?? "/"
  const { user } = useAuthUser()
  const t = useT()

  // No checkout o botão flutuaria por cima do QR code do PIX / formulário do
  // cartão; nas telas de suporte ele apontaria para a própria página.
  if (
    pathname.startsWith("/checkout") ||
    pathname === "/suporte" ||
    pathname.startsWith("/conta/suporte")
  ) {
    return null
  }

  const awaiting = (user?.supportTicketsAwaitingMe ?? 0) > 0
  const href = awaiting ? "/conta/suporte" : "/suporte"
  const label = awaiting ? t.auth.supportAwaiting : t.auth.support

  return (
    <RouteLink
      href={href}
      aria-label={label}
      title={label}
      className="fixed bottom-[calc(1rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex size-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold text-foreground shadow-[0_12px_28px_-10px_rgba(0,0,0,0.85)] transition-all hover:bg-muted md:bottom-6 md:right-6 md:h-11 md:w-auto md:px-4"
    >
      <LifeBuoy className="size-[18px] md:size-4" />
      <span className="hidden md:inline">{t.auth.support}</span>
      {awaiting && (
        <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-card" />
      )}
    </RouteLink>
  )
}
