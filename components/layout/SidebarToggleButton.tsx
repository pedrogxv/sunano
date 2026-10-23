"use client"

import { PanelLeft } from "lucide-react"
import { usePathname } from "@/lib/hooks/use-pathname"
import { useSidebar } from "@/components/providers/sidebar-context"
import { cn } from "@/lib/utils"

/**
 * Botão que recolhe a sidebar (desktop) ou abre a gaveta (mobile). Mora na
 * TopBar e no menu da Loja, que substitui a TopBar em /loja: no celular ele é
 * o único acesso à navegação do site, então não pode faltar em nenhum header.
 */
export function SidebarToggleButton({ className }: { className?: string }) {
  const {
    publicCollapsed,
    adminCollapsed,
    togglePublic,
    toggleAdmin,
    isMobileOpen,
    isAdminMobileOpen,
    setMobileOpen,
    setAdminMobileOpen,
  } = useSidebar()
  const pathname = usePathname()

  const isAdmin = pathname?.startsWith("/admin")
  const isCollapsed = isAdmin ? adminCollapsed : publicCollapsed
  const toggleCollapsed = isAdmin ? toggleAdmin : togglePublic

  // No desktop colapsa/expande a sidebar; no mobile abre/fecha o drawer.
  // As duas ações NÃO são intercambiáveis: `toggleCollapsed` também vale no
  // mobile, e disparar os dois juntos abria o drawer já colapsado (só ícones)
  // no primeiro toque. Por isso o breakpoint é checado de verdade aqui.
  const handleSidebarToggle = () => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches
    if (isDesktop) {
      toggleCollapsed()
      return
    }
    if (isAdmin) {
      setAdminMobileOpen(!isAdminMobileOpen)
    } else {
      setMobileOpen(!isMobileOpen)
    }
  }

  return (
    <button
      type="button"
      onClick={handleSidebarToggle}
      className={cn(
        // 44px no mobile: é o único acesso à gaveta de navegação por lá.
        "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground md:size-8",
        className
      )}
      aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
    >
      <PanelLeft className="size-[18px]" />
    </button>
  )
}
