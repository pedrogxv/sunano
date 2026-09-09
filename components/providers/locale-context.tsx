"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_LOCALE,
  getLocale,
  isLocaleCode,
  LANGUAGE_STORAGE_KEY,
  matchBrowserLocale,
  type LocaleCode,
} from "@/lib/i18n"

type LocaleContextValue = {
  locale: LocaleCode
  setLocale: (nextLocale: LocaleCode) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
})

/**
 * Idioma da interface, resolvido nesta ordem de precedência:
 *
 * 1. **Perfil** (quando logado) — é a escolha explícita do usuário e vale
 *    entre dispositivos, então sobrepõe tudo.
 * 2. **localStorage** — a escolha feita neste navegador.
 * 3. **Idioma do navegador** — só quando não há escolha registrada em lugar
 *    nenhum. Um visitante estrangeiro cai em inglês sem precisar procurar a
 *    configuração; um brasileiro continua em pt-BR porque é o que o navegador
 *    dele informa.
 * 4. `DEFAULT_LOCALE` (pt-BR) para qualquer idioma que não suportamos.
 *
 * O idioma detectado NÃO é gravado em localStorage: gravá-lo viraria uma
 * escolha do usuário e congelaria o valor, fazendo com que uma troca posterior
 * do idioma do navegador deixasse de ter efeito. Só `setLocale` persiste.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Inicia sempre em DEFAULT_LOCALE para bater com o HTML do servidor (que é
  // pt-BR fixo); o valor real é resolvido no efeito abaixo, já no cliente.
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE)

  function applyLocale(next: LocaleCode) {
    setLocaleState(next)
    document.documentElement.lang = next
  }

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    } catch {
      // localStorage pode estar indisponível (modo privado, cookies bloqueados).
    }

    if (stored && isLocaleCode(stored)) {
      applyLocale(getLocale(stored))
      return
    }

    applyLocale(matchBrowserLocale(navigator.languages) ?? DEFAULT_LOCALE)
  }, [])

  // Sincroniza o idioma salvo no perfil (cross-device). Best-effort: deslogado,
  // /api/profile responde 401 e mantemos o que foi resolvido acima. `locale`
  // nulo significa "nunca configurou" — nesse caso não sobrescreve a detecção.
  useEffect(() => {
    let mounted = true
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const remote = data?.profile?.locale as string | null | undefined
        if (!mounted || !remote || !isLocaleCode(remote)) return
        applyLocale(remote)
        try {
          window.localStorage.setItem(LANGUAGE_STORAGE_KEY, remote)
        } catch {
          // idem: preferência segue valendo só nesta sessão.
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // `useCallback` para o valor do contexto não trocar de identidade a cada
  // render — sem isso o `useMemo` abaixo recriaria o objeto sempre, e todo
  // consumidor de `useLocale` re-renderizaria junto.
  const setLocale = useCallback((nextLocale: LocaleCode) => {
    applyLocale(nextLocale)
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale)
    } catch {
      // idem.
    }
  }, [])

  const value = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
