"use client"

import { useEffect } from "react"

import { useAuthUser } from "@/components/providers/auth-context"
import { useLocale } from "@/components/providers/locale-context"
import { isLocaleCode } from "@/lib/i18n"

/**
 * Aplica o idioma salvo no perfil (cross-device), que vence o localStorage e o
 * idioma do navegador resolvidos pelo `LocaleProvider`.
 *
 * Mora DENTRO do `AuthProvider` para só consultar `/api/profile` com sessão
 * confirmada. Quando a busca ficava no `LocaleProvider` (que fica por fora da
 * auth), todo visitante deslogado disparava um 401 em toda página: era o
 * "Erros do navegador foram registrados no console" do Lighthouse, além de
 * uma requisição à toa por pageview. Também passa a resincronizar ao trocar
 * de conta, o que antes só acontecia recarregando a página.
 */
export function ProfileLocaleSync() {
  const { user, loading } = useAuthUser()
  const { setLocale } = useLocale()
  const userId = user?.id ?? null

  useEffect(() => {
    // Espera a resposta do servidor: com `loading`, o `user` pode ser só o
    // palpite do snapshot, e a sessão pode já ter acabado.
    if (loading || !userId) return
    let mounted = true
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // `locale` nulo significa "nunca configurou": não sobrescreve a detecção.
        const remote = data?.profile?.locale as string | null | undefined
        if (!mounted || !remote || !isLocaleCode(remote)) return
        setLocale(remote)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [loading, userId, setLocale])

  return null
}
