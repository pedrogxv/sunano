"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"

export type AuthModalMode = "login" | "register"

interface AuthModalContextValue {
  isOpen: boolean
  mode: AuthModalMode
  /** Para onde mandar a pessoa após um login OAuth (o popup fecha sozinho: o navegador sai da página). */
  next: string
  openLogin: (next?: string) => void
  openRegister: (next?: string) => void
  close: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<AuthModalMode>("login")
  const [next, setNext] = useState("/forum")

  const openLogin = useCallback((nextPath = "/forum") => {
    setMode("login")
    setNext(nextPath)
    setIsOpen(true)
  }, [])

  const openRegister = useCallback((nextPath = "/forum") => {
    setMode("register")
    setNext(nextPath)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, mode, next, openLogin, openRegister, close }),
    [isOpen, mode, next, openLogin, openRegister, close]
  )

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>
}

const AUTH_MODAL_FALLBACK: AuthModalContextValue = {
  isOpen: false,
  mode: "login",
  next: "/forum",
  openLogin: () => {},
  openRegister: () => {},
  close: () => {},
}

export function useAuthModal(): AuthModalContextValue {
  return useContext(AuthModalContext) ?? AUTH_MODAL_FALLBACK
}
