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
