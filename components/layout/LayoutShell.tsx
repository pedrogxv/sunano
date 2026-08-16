"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { TopBar } from "@/components/layout/TopBar"
import { ChangelogBanner } from "@/components/layout/ChangelogBanner"
import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { CartDrawer } from "@/components/store/CartDrawer"
import { useAuthModal } from "@/components/providers/auth-modal-context"

// Code-split: o AuthModal puxa UserLoginForm/UserRegisterForm, que por sua
// vez puxam @supabase/ssr — pesado e só relevante para quem realmente abre o
// popup de login/cadastro. Só é importado depois do primeiro `isOpen` (ver
// `{isOpen && <AuthModal />}` abaixo), então páginas que nunca tocam em auth
// não pagam esse peso no bundle inicial.
const AuthModal = dynamic(() => import("@/components/auth/AuthModal").then((m) => m.AuthModal), {
  ssr: false,
})

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isOpen: isAuthModalOpen } = useAuthModal()
  // Uma vez aberto, o AuthModal fica montado (mesmo com isOpen=false depois)
  // para o Dialog poder rodar a animação de saída — desmontar junto com o
  // fechamento cortaria essa transição pela metade. `useState` com
  // inicializador não recalcula em renders seguintes, então isto só liga a
  // chave na primeira vez que `isOpen` aparece `true`.
  const [hasOpenedAuthModal, setHasOpenedAuthModal] = useState(false)
  if (isAuthModalOpen && !hasOpenedAuthModal) setHasOpenedAuthModal(true)
  const isAdminLogin = pathname === "/admin/login"
  const isAdmin = pathname.startsWith("/admin") && !isAdminLogin
  // Idem TopBar: a gaveta do carrinho não deve flutuar por cima do fluxo de checkout.
  const isCheckout = pathname.startsWith("/checkout")
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/2fa" ||
    pathname === "/consentimento"

  // Admin pages that self-manage their own padding/max-width (like PerifericosContent)
  const isSelfPaddedAdminPage = pathname === "/admin/perifericos"

  if (isAdminLogin || isAuthPage) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        {/* Sidebar — fixed drawer on mobile (self-managed), relative+sticky on desktop.
            Must NOT be hidden on mobile, otherwise the drawer/overlay/toggle never render. */}
        <div className="md:flex md:shrink-0 md:sticky md:top-0 md:h-screen">
          {isAdmin ? <AdminSidebar /> : <PublicSidebar />}
        </div>

        {/* Content area */}
        {isAdmin ? (
          <div className="flex-1 min-w-0 bg-card md:mx-2 md:mt-2 md:mb-2 rounded-none md:rounded-2xl md:ml-0">
            <TopBar />
            <ChangelogBanner />
            {isSelfPaddedAdminPage ? (
              <main className="overflow-auto">{children}</main>
            ) : (
              <main className="overflow-auto p-4 md:p-6">
                <div className="mx-auto max-w-7xl">{children}</div>
              </main>
            )}
          </div>
        ) : (
          <div className="flex-1 min-w-0 bg-card md:mx-2 md:mt-2 md:mb-2 rounded-none md:rounded-2xl md:ml-0">
            <TopBar />
            <ChangelogBanner />
            <main>{children}</main>
          </div>
        )}
      </div>

      {!isAdmin && !isCheckout && <CartDrawer />}
      {hasOpenedAuthModal && <AuthModal />}
    </div>
  )
}
