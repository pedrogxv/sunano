"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import type { ProfileData } from "@/components/account/ProfileSection"

export type UseOwnProfileResult = {
  profile: ProfileData | null
  setProfile: (profile: ProfileData) => void
  loading: boolean
}

/**
 * Carrega o perfil do usuário logado (usado pelas páginas /perfil e /conta).
 * Redireciona para /login quando não há sessão.
 */
export function useOwnProfile(): UseOwnProfileResult {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const meRes = await fetch("/api/auth/me")
        const me = await meRes.json().catch(() => null)
        if (!me?.user) {
          router.replace("/login")
          return
        }
        const res = await fetch("/api/profile")
        const data = (await res.json().catch(() => null)) as { profile?: ProfileData } | null
        if (mounted && data?.profile) setProfile(data.profile)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [router])

  return { profile, setProfile, loading }
}
