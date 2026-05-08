"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface SidebarContextValue {
  publicCollapsed: boolean
  adminCollapsed: boolean
  isMobileOpen: boolean
  togglePublic: () => void
  toggleAdmin: () => void
  setMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [publicCollapsed, setPublicCollapsed] = useState(false)
  const [adminCollapsed, setAdminCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <SidebarContext.Provider
      value={{
        publicCollapsed,
        adminCollapsed,
        isMobileOpen,
        togglePublic: () => setPublicCollapsed((prev) => !prev),
        toggleAdmin: () => setAdminCollapsed((prev) => !prev),
        setMobileOpen: setIsMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider")
  return ctx
}
