"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { usePathname } from "@/lib/hooks/use-pathname"
import { TopBar } from "@/components/layout/TopBar"
import { ContentSurface } from "@/components/layout/TopBarDock"
import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { CartDrawer } from "@/components/store/CartDrawer"
import { SupportFab } from "@/components/layout/SupportFab"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { VipIntentWatcher } from "@/components/aura/VipIntentWatcher"

// Code-split: o AuthModal puxa UserLoginForm/UserRegisterForm, que por sua
// vez puxam @supabase/ssr — pesado e só relevante para quem realmente abre o
// popup de login/cadastro. Só é importado depois do primeiro `isOpen` (ver
// `{isOpen && <AuthModal />}` abaixo), então páginas que nunca tocam em auth
// não pagam esse peso no bundle inicial.
const AuthModal = dynamic(() => import("@/components/auth/AuthModal").then((m) => m.AuthModal), {
  ssr: false,
})

// Import estático colocava a sidebar do painel inteira (e os ícones dela) no
// bundle de TODA página pública. Com `dynamic` (SSR mantido) o chunk só é
// baixado quando a rota é /admin.
const AdminSidebar = dynamic(() =>
  import("@/components/layout/AdminSidebar").then((m) => m.AdminSidebar)
)

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
  const isAdmin = pathname.startsWith("/admin")
  // Idem TopBar: a gaveta do carrinho não deve flutuar por cima do fluxo de checkout.
  const isCheckout = pathname.startsWith("/checkout")
  // A Loja tem o próprio header (StoreCategoryNav: sidebar, busca, categorias,
  // carrinho, sino e conta). Com a TopBar por cima, eram duas barras empilhadas
  // repetindo pedidos, carrinho e conta. O aviso de changelog sai junto (a
  // Loja nunca o mostrou).
  const isStore = pathname === "/loja" || pathname.startsWith("/loja/")
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/2fa" ||
    pathname === "/consentimento"
  // Manutenção: sidebar e TopBar oferecem navegação para um site que está
  // fechado — todo link levaria de volta para cá. A tela vai sozinha, sem
  // chrome, como as páginas de auth.
  const isMaintenancePage = pathname === "/maintenance"

  // Admin pages that self-manage their own padding/max-width (like PerifericosContent)
  const isSelfPaddedAdminPage = pathname === "/admin/perifericos"

  if (isAuthPage || isMaintenancePage) {
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
            Must NOT be hidden on mobile, otherwise the drawer/overlay/toggle never render.
            Flutua (painel de vidro) com o mesmo respiro de 8px nos QUATRO
            lados: o da direita é o vão até a barra do topo e o conteúdo. Sem
            ele a ilha da TopBar encostava na sidebar e as duas pareciam uma
            peça só, emendada. */}
        <div className="md:flex md:shrink-0 md:sticky md:top-0 md:h-screen md:p-2">
          {isAdmin ? <AdminSidebar /> : <PublicSidebar />}
        </div>

        {/* Content area — uma coluna com DOIS painéis soltos, como a
            sidebar: a barra do topo (ilha de vidro sticky, TopBarDock) e,
            8px abaixo, a superfície do conteúdo. A Loja traz a própria barra
            (StoreCategoryNav), que abre a superfície depois de si; por isso
            ali o <main> é só a coluna, sem cartão. */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col md:mr-2 md:pb-2">
          {!isStore && <TopBar />}
          {isAdmin ? (
            <ContentSurface>
              {isSelfPaddedAdminPage ? (
                <main className="overflow-auto">{children}</main>
              ) : (
                <main className="overflow-auto p-4 md:p-6">
                  <div className="mx-auto max-w-7xl">{children}</div>
                </main>
              )}
            </ContentSurface>
          ) : isStore ? (
            /* overflow-x-clip (e não hidden): hidden no eixo X força o Y a
               `auto`, vira container de rolagem e quebra todo sticky de
               dentro — a própria barra da Loja entre eles. */
            <main className="store-main flex min-w-0 flex-1 flex-col overflow-x-clip">{children}</main>
          ) : (
            <ContentSurface>
              {/* overflow-x-clip e não hidden: ver o comentário do ramo da Loja. */}
              <main className="min-w-0 overflow-x-clip">{children}</main>
            </ContentSurface>
          )}
        </div>
      </div>

      {!isAdmin && !isCheckout && <CartDrawer />}
      {!isAdmin && <SupportFab />}
      {hasOpenedAuthModal && <AuthModal />}
      {/* Retoma o popup do VIP para quem acabou de logar por causa dele. Fica
          no layout porque o login pode terminar em OUTRA página: o OAuth sai
          do site e volta em `/auth/callback?next=…`. Ver VipIntentWatcher. */}
      {!isAdmin && <VipIntentWatcher />}
    </div>
  )
}
