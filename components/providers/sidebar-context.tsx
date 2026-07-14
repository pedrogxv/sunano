"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

interface SidebarContextValue {
  publicCollapsed: boolean
  adminCollapsed: boolean
  isMobileOpen: boolean
  isAdminMobileOpen: boolean
  togglePublic: () => void
  toggleAdmin: () => void
  setMobileOpen: (open: boolean) => void
  setAdminMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [publicCollapsed, setPublicCollapsed] = useState(false)
  const [adminCollapsed, setAdminCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isAdminMobileOpen, setIsAdminMobileOpen] = useState(false)

  // Trava o scroll do body enquanto o drawer mobile estiver aberto,
  // evitando que a página por trás do overlay role junto.
  useEffect(() => {
    const shouldLock = isMobileOpen || isAdminMobileOpen
    if (!shouldLock) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobileOpen, isAdminMobileOpen])

  return (
    <SidebarContext.Provider
      value={{
        publicCollapsed,
        adminCollapsed,
        isMobileOpen,
        isAdminMobileOpen,
        togglePublic: () => setPublicCollapsed((prev) => !prev),
        toggleAdmin: () => setAdminCollapsed((prev) => !prev),
        setMobileOpen: setIsMobileOpen,
        setAdminMobileOpen: setIsAdminMobileOpen,
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
