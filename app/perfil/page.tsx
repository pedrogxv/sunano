"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Link2, Shield, SlidersHorizontal, User } from "lucide-react"

import { LinkedAccountsTab } from "@/components/account/LinkedAccountsTab"
import { PreferencesTab } from "@/components/account/PreferencesTab"
import { PrivacidadeTab } from "@/components/account/PrivacidadeTab"
import { ProfileTab, type ProfileData } from "@/components/account/ProfileTab"
import { SecurityTab } from "@/components/account/SecurityTab"
import BoxLoader from "@/components/ui/box-loader"
import { cn } from "@/lib/utils"

type TabKey = "profile" | "security" | "linked" | "preferences" | "privacidade"

const TABS: { key: TabKey; label: string; Icon: typeof User }[] = [
  { key: "profile", label: "Perfil", Icon: User },
  { key: "security", label: "Segurança", Icon: KeyRound },
  { key: "linked", label: "Contas", Icon: Link2 },
  { key: "preferences", label: "Preferências", Icon: SlidersHorizontal },
  { key: "privacidade", label: "Privacidade", Icon: Shield },
]

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>("profile")

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

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua conta, segurança e preferências.</p>
      </header>

      <div className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>

      {tab === "profile" && <ProfileTab profile={profile} onProfileChange={setProfile} />}
      {tab === "security" && <SecurityTab email={profile.email} />}
      {tab === "linked" && <LinkedAccountsTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "privacidade" && (
        <PrivacidadeTab
          email={profile.email}
          lgpdConsentAt={profile.lgpd_consent_at ?? null}
          lgpdConsentVersion={profile.lgpd_consent_version ?? null}
        />
      )}
    </div>
  )
}
