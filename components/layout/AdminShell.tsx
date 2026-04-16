"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Eye, Home, LogOut, Menu, NotebookPen, Package, Settings, X } from "lucide-react"

import { logoutAction } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useState } from "react"

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: Home },
  { href: "/admin/peripherals", label: "Perifericos", icon: Package },
  { href: "/admin/blog", label: "Blog & Reviews", icon: NotebookPen },
  { href: "/admin/tiers", label: "Gerenciar Tiers", icon: BarChart3 },
  { href: "/admin/settings", label: "Configuracoes", icon: Settings },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href) && href !== "/"
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100">
      <div className="flex min-h-screen pt-16 md:pl-64">
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 top-16 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r border-white/[0.08] bg-[#0d1117] transition-transform duration-300 md:translate-x-0",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="border-b border-white/[0.08] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 font-bold text-white shadow-lg shadow-cyan-500/20">
                S
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-50">Sunano</span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-cyan-400">Admin</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-hidden px-3 pt-6 pb-4">
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-cyan-500/10 text-cyan-300"
                        : "text-slate-300 hover:bg-white/[0.05] hover:text-slate-100"
                    )}
                  >
                    <Icon className="size-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="my-4 h-px bg-white/[0.08]" />

            <div className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Acoes
              </p>
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-emerald-500/10 hover:text-emerald-300"
              >
                <Eye className="size-[18px]" />
                <span>Ver Site</span>
              </Link>
              <form action={logoutAction}>
                <Button
                  className="w-full justify-start gap-3 text-slate-300 hover:bg-red-500/10 hover:text-red-300"
                  type="submit"
                  variant="ghost"
                >
                  <LogOut className="size-[18px]" />
                  <span>Sair</span>
                </Button>
              </form>
            </div>
          </nav>

          <div className="border-t border-white/[0.08] px-4 py-3">
            <p className="text-[10px] text-slate-600">Sunano Admin v1.0</p>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>

        <Button
          className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full border border-white/[0.1] bg-[#131921] text-slate-100 shadow-lg hover:bg-[#1c2433] md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          size="icon"
        >
          {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>
    </div>
  )
}