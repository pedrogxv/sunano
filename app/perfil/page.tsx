"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, ShieldCheck, UserRound } from "lucide-react"

import { AccountSection } from "@/components/account/AccountSection"
import { ProfileSection, type ProfileData } from "@/components/account/ProfileSection"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import BoxLoader from "@/components/ui/box-loader"
import { getTierCapabilities, coerceAccountTier } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"
import { cn } from "@/lib/utils"

type SectionKey = "perfil" | "conta"

const SECTIONS: { key: SectionKey; label: string; hint: string; Icon: typeof UserRound }[] = [
  { key: "perfil", label: "Perfil", hint: "Identidade e vitrine pública", Icon: UserRound },
  {
    key: "conta",
    label: "Conta e segurança",
    hint: "Acesso, preferências e privacidade",
    Icon: ShieldCheck,
  },
]

function sectionFromHash(): SectionKey {
  if (typeof window === "undefined") return "perfil"
  return window.location.hash.replace("#", "").startsWith("conta") ? "conta" : "perfil"
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<SectionKey>("perfil")

  useEffect(() => {
    setSection(sectionFromHash())
  }, [])

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

  function selectSection(key: SectionKey) {
    setSection(key)
    // Mantém a seção linkável (ex.: /perfil#conta) sem empilhar histórico.
    window.history.replaceState(null, "", key === "perfil" ? window.location.pathname : `#${key}`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  const name = profile.display_name?.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const tierLabel = getTierCapabilities(coerceAccountTier(profile.account_tier)).label
  // O endereço público é o slug do nome; o UUID fica de reserva para perfis
  // ainda sem slug (antes da migration rodar).
  const publicProfileHref = profile.display_slug
    ? profilePath(profile.display_slug)
    : profile.id
      ? `/perfil/${profile.id}`
      : null

  return (
    <div className="pb-16">
      {/* Cabeçalho — quem é você, com atalho para o perfil público. */}
      <header className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 pt-8 md:px-6">
        <Avatar className="size-14 border border-border">
          <AvatarImage src={profile.avatar_url ?? undefined} alt={name} />
          <AvatarFallback className="text-lg font-bold">
            {name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{name}</h1>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tierLabel}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">{profile.email ?? "-"}</p>
        </div>

        {publicProfileHref && (
          <Link
            href={publicProfileHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            Ver perfil público
          </Link>
        )}
      </header>

      {/* Navegação em abas no topo — sem segunda barra lateral. */}
      <div className="sticky top-0 z-20 mt-6 border-b border-border bg-card/95 backdrop-blur">
        <nav className="mx-auto flex max-w-4xl gap-6 overflow-x-auto px-4 md:px-6">
          {SECTIONS.map(({ key, label, hint, Icon }) => {
            const active = section === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectSection(key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex shrink-0 items-start gap-2.5 py-3 text-left transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="mt-0.5 size-[18px] shrink-0" />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="hidden text-[11px] text-muted-foreground sm:block">{hint}</span>
                </span>
                <span
                  className={cn(
                    "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-opacity",
                    active ? "bg-foreground opacity-100" : "opacity-0"
                  )}
                />
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        {section === "perfil" ? (
          <ProfileSection profile={profile} onProfileChange={setProfile} />
        ) : (
          <AccountSection
            email={profile.email}
            lgpdConsentAt={profile.lgpd_consent_at ?? null}
            lgpdConsentVersion={profile.lgpd_consent_version ?? null}
          />
        )}
      </div>
    </div>
  )
}
