"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, LayoutGrid, Link2, Shield, SlidersHorizontal, User } from "lucide-react"

import { LinkedAccountsTab } from "@/components/account/LinkedAccountsTab"
import { PreferencesTab } from "@/components/account/PreferencesTab"
import { PrivacidadeTab } from "@/components/account/PrivacidadeTab"
import { ProfileTab, type ProfileData } from "@/components/account/ProfileTab"
import { SecurityTab } from "@/components/account/SecurityTab"
import { VitrineTab } from "@/components/account/VitrineTab"
import BoxLoader from "@/components/ui/box-loader"
import { cn } from "@/lib/utils"

type TabKey = "profile" | "vitrine" | "security" | "linked" | "preferences" | "privacidade"

const TABS: { key: TabKey; label: string; Icon: typeof User }[] = [
  { key: "profile", label: "Perfil", Icon: User },
  { key: "vitrine", label: "Vitrine", Icon: LayoutGrid },
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
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações da conta</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil, segurança e preferências.</p>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <nav className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-6 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:pb-0">
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all md:shrink",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {tab === "profile" && <ProfileTab profile={profile} onProfileChange={setProfile} />}
          {tab === "vitrine" && <VitrineTab accountTier={profile.account_tier} />}
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
      </div>
    </div>
  )
}
