"use client"

import { useAuthUser } from "@/components/providers/auth-context"
import type { FeatureFlagKey } from "@/lib/feature-flags"

/**
 * A flag está ligada para quem está logado? Lê a lista já avaliada no
 * servidor (payload de `/api/auth/me`), sem request próprio.
 *
 * Visitante sem conta recebe `false` daqui: para ele só vale o modo "Todos",
 * e as telas cacheadas (ISR) resolvem esse caso no render do servidor.
 *
 * Esconder no cliente é conforto visual, não segurança: a rota da feature
 * confere a flag de novo (`isFeatureEnabled`, lib/server/feature-flags.ts).
 * O snapshot antigo da sessão pode não ter o campo, daí o `?.`.
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { user } = useAuthUser()
  return user?.enabledFlags?.includes(key) ?? false
}
