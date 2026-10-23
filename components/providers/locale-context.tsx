"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  DEFAULT_LOCALE,
  getLocale,
  isLocaleCode,
  LANGUAGE_STORAGE_KEY,
  matchBrowserLocale,
  type LocaleCode,
  type Translations,
} from "@/lib/i18n"
import { ptBR } from "@/lib/i18n-pt-br"

type LocaleContextValue = {
  locale: LocaleCode
  setLocale: (nextLocale: LocaleCode) => void
  /** Textos do idioma ativo — leia por `useT()`. */
  dictionary: Translations
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  dictionary: ptBR,
})

/**
 * Dicionário de cada idioma. Só o pt-BR vai no bundle; o en-US (~85KB) é
 * baixado na primeira vez que alguém precisa dele. O idioma só troca DEPOIS
 * de o dicionário chegar, então a tela nunca mistura os dois.
 */
async function loadDictionary(locale: LocaleCode): Promise<Translations> {
  if (locale === "en-US") return (await import("@/lib/i18n-en-us")).default
  return ptBR
}

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
  const [state, setState] = useState<{ locale: LocaleCode; dictionary: Translations }>({
    locale: DEFAULT_LOCALE,
    dictionary: ptBR,
  })
  const { locale, dictionary } = state

  // Guarda o pedido mais recente: duas trocas rápidas (en → pt) não podem
  // terminar no idioma cujo download acabou por último.
  const requestedRef = useRef<LocaleCode>(DEFAULT_LOCALE)

  const applyLocale = useCallback((next: LocaleCode) => {
    requestedRef.current = next
    void loadDictionary(next)
      .then((nextDictionary) => {
        if (requestedRef.current !== next) return
        setState({ locale: next, dictionary: nextDictionary })
        document.documentElement.lang = next
      })
      .catch(() => {
        // Sem rede para o chunk do inglês: continua no pt-BR, que é o HTML.
      })
  }, [])

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
  }, [applyLocale])

  // O idioma salvo no PERFIL (passo 1) é aplicado por `ProfileLocaleSync`,
  // que mora dentro do AuthProvider para só consultar com sessão.

  // `useCallback` para o valor do contexto não trocar de identidade a cada
  // render — sem isso o `useMemo` abaixo recriaria o objeto sempre, e todo
  // consumidor de `useLocale` re-renderizaria junto.
  const setLocale = useCallback(
    (nextLocale: LocaleCode) => {
      applyLocale(nextLocale)
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale)
      } catch {
        // idem.
      }
    },
    [applyLocale]
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      dictionary,
    }),
    [locale, setLocale, dictionary]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
