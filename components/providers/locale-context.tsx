"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { DEFAULT_LOCALE, getLocale, isLocaleCode, LANGUAGE_STORAGE_KEY, type LocaleCode } from "@/lib/i18n"

type LocaleContextValue = {
  locale: LocaleCode
  setLocale: (nextLocale: LocaleCode) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE)

  useEffect(() => {
    const storedLocale = getLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
    setLocaleState(storedLocale)
    document.documentElement.lang = storedLocale
  }, [])

  // Sincroniza o idioma salvo no perfil (cross-device). Best-effort: deslogado,
  // /api/profile responde 401 e mantemos a preferência local.
  useEffect(() => {
    let mounted = true
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const remote = data?.profile?.locale as string | null | undefined
        if (!mounted || !remote || !isLocaleCode(remote)) return
        setLocaleState(remote)
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, remote)
        document.documentElement.lang = remote
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const setLocale = (nextLocale: LocaleCode) => {
    setLocaleState(nextLocale)
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale)
    document.documentElement.lang = nextLocale
  }

  const value = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
