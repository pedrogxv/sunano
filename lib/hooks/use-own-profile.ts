"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import type { ProfileData } from "@/components/account/ProfileSection"

export type UseOwnProfileResult = {
  profile: ProfileData | null
  setProfile: (profile: ProfileData) => void
  loading: boolean
  /**
   * Carga terminou SEM perfil — a página tem que mostrar erro, não esqueleto.
   *
   * Existe porque `loading: false` + `profile: null` é um estado alcançável e
   * indistinguível de "ainda carregando" para quem só olha os dois primeiros
   * campos: a tela fica no loader para sempre, sem erro e sem retentativa.
   * Foi o que trancou um WEB MASTER sem 2FA fora de /conta — o gate do
   * proxy respondia 403 em `/api/profile`, o `setProfile` nunca acontecia e a
   * única tela que cadastra TOTP nunca chegava a montar. Ver proxy.ts,
   * `isMfaSetupAllowedPath`.
   */
  error: boolean
  /** Refaz a carga — alimenta o botão "Tentar novamente" da tela de erro. */
  reload: () => void
}

/**
 * Carrega o perfil do usuário logado (usado pelas páginas /perfil e /conta).
 * Redireciona para /login quando não há sessão.
 */
export function useOwnProfile(): UseOwnProfileResult {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    setError(false)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      // Sessão ausente termina em `router.replace`, não em erro: a navegação
      // é a resposta certa e a tela não deve piscar "erro" antes de sair.
      let redirecting = false
      try {
        const meRes = await fetch("/api/auth/me")
        const me = await meRes.json().catch(() => null)
        if (!me?.user) {
          redirecting = true
          router.replace("/login")
          return
        }
        const res = await fetch("/api/profile")
        const data = (await res.json().catch(() => null)) as { profile?: ProfileData } | null
        if (!mounted) return
        if (data?.profile) setProfile(data.profile)
        else setError(true)
      } catch {
        if (mounted) setError(true)
      } finally {
        if (mounted && !redirecting) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [router, attempt])

  return { profile, setProfile, loading, error, reload }
}
