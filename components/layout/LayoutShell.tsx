"use client"

import { usePathname } from "next/navigation"
import { TopBar } from "@/components/layout/TopBar"
import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { AdminShell } from "@/components/layout/AdminShell"

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname.includes("/admin")

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex md:shrink-0 md:sticky top-0 md:h-screen">
          {isAdmin ? <AdminShell>{children}</AdminShell> : <PublicSidebar />}
        </div>
        <div className="flex-1 min-w-0 bg-card m-2 rounded-2xl">
          <TopBar />
          <main className="">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <div className="md:hidden">
        {isAdmin ? <AdminShell>{children}</AdminShell> : <PublicSidebar />}
      </div>
    </div>
  )
}
