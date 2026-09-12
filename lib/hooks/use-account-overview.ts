"use client"

import { useCallback, useEffect, useState } from "react"

import { supabaseAuth } from "@/lib/client/supabase-auth"

/**
 * Estado resumido de cada área da conta, para o hub de /conta mostrar o
 * status real no rosto do card ("2FA ativo", "2 de 2 conectadas") em vez de
 * uma descrição genérica que obriga a abrir a seção só para descobrir como
 * as coisas estão.
 *
 * POR QUE UM HOOK, E NÃO CADA CARD BUSCANDO O SEU
 * -----------------------------------------------
 * Os fatores de MFA e as identidades sociais só eram conhecidos DENTRO de
 * `SecurityTab` / `LinkedAccountsTab`, que montam apenas quando a seção
 * abre. O hub precisa deles antes disso. Buscar no card e de novo na tab
 * dobraria as chamadas e abriria espaço para os dois discordarem na tela ao
 * mesmo tempo — o hub dizendo "2FA ativo" enquanto a seção aberta mostra
 * "desativado". Aqui a leitura acontece uma vez, no nível do hub.
 *
 * `refresh` é o que mantém os dois em acordo: as tabs chamam depois de
 * ativar/desativar 2FA ou (des)vincular uma conta, e o selo do card
 * acompanha a mudança sem recarregar a página.
 *
 * Tolerante a falha de propósito: um status que não carregou vira `null` e o
 * card simplesmente omite o selo. Nada aqui bloqueia a seção de abrir nem de
 * funcionar — o dado é enfeite informativo, e a tab é a fonte da verdade
 * quando está aberta.
 */
export type AccountOverview = {
  /** `null` enquanto carrega ou se a leitura falhou. */
  twoFactorEnabled: boolean | null
  /** Quantas contas sociais estão vinculadas (Google, Discord). */
  linkedProviders: number | null
  /** Total de provedores oferecidos — denominador do "2 de 2". */
  totalProviders: number
  loading: boolean
  refresh: () => void
}

/**
 * Mantido em sincronia com os PROVIDERS de `LinkedAccountsTab`.
 *
 * `getUserIdentities` devolve TAMBÉM a identidade `email` (login por senha),
 * que não é uma "conta vinculada" na leitura desta tela — contá-la faria o
 * selo dizer "1 de 2 conectadas" para quem não vinculou nada. Só os sociais
 * entram na conta.
 */
const SOCIAL_PROVIDERS = ["google", "discord"] as const
const TOTAL_PROVIDERS = SOCIAL_PROVIDERS.length

export function useAccountOverview(): AccountOverview {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null)
  const [linkedProviders, setLinkedProviders] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let mounted = true

    async function load() {
      // As duas leituras são independentes: uma falhar não deve apagar o selo
      // da outra, por isso `allSettled` em vez de `all` com um try único.
      const [mfa, identities] = await Promise.allSettled([
        supabaseAuth.auth.mfa.listFactors(),
        supabaseAuth.auth.getUserIdentities(),
      ])
      if (!mounted) return

      if (mfa.status === "fulfilled" && !mfa.value.error) {
        setTwoFactorEnabled(mfa.value.data.totp.some((f) => f.status === "verified"))
      } else {
        setTwoFactorEnabled(null)
      }

      if (identities.status === "fulfilled" && !identities.value.error) {
        const social = (identities.value.data.identities ?? []).filter((i) =>
          SOCIAL_PROVIDERS.some((p) => p === i.provider)
        )
        setLinkedProviders(social.length)
      } else {
        setLinkedProviders(null)
      }

      setLoading(false)
    }

    void load()
    return () => {
      mounted = false
    }
  }, [tick])

  return {
    twoFactorEnabled,
    linkedProviders,
    totalProviders: TOTAL_PROVIDERS,
    loading,
    refresh,
  }
}
