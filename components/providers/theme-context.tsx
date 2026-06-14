"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

type ThemeKey = "midnight" | "emerald" | "amber" | "rose" | "light" | "dark"

type ThemeOption = {
  key: ThemeKey
  label: string
}

type ThemeContextValue = {
  theme: ThemeKey
  setTheme: (theme: ThemeKey) => void
  themes: ThemeOption[]
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = "sunano-theme"

const THEME_OPTIONS: ThemeOption[] = [
  { key: "midnight", label: "Midnight" },
  { key: "dark", label: "Dark (Pure Black)" },
  { key: "light", label: "Light (Pure White)" },
  { key: "emerald", label: "Emerald" },
  { key: "amber", label: "Amber" },
  { key: "rose", label: "Rose" },
]

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>("midnight")

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(THEME_STORAGE_KEY) : null
    const nextTheme = (stored as ThemeKey) || "midnight"
    setThemeState(nextTheme)
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", nextTheme)
    }
  }, [])

  // Sincroniza a preferência salva no perfil (cross-device). Best-effort: se o
  // usuário não estiver logado, /api/profile responde 401 e mantemos o local.
  useEffect(() => {
    let mounted = true
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const remote = data?.profile?.theme as ThemeKey | null | undefined
        if (!mounted || !remote || !THEME_OPTIONS.some((t) => t.key === remote)) return
        setThemeState(remote)
        localStorage.setItem(THEME_STORAGE_KEY, remote)
        document.documentElement.setAttribute("data-theme", remote)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const setTheme = (nextTheme: ThemeKey) => {
    setThemeState(nextTheme)
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", nextTheme)
    }
  }

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    themes: THEME_OPTIONS,
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}
