"use client"

import Link from "next/link"
import { Activity, Eye, Flame, Heart, UserPlus, Users } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { PodiumSection } from "@/components/people/PodiumSection"
import { ProfileCard } from "@/components/people/ProfileCard"
import { cn } from "@/lib/utils"
import type {
  DirectoryMetric,
  DirectorySort,
  PublicProfileSummary,
} from "@/lib/user-directory"

const TABS: {
  key: DirectorySort
  label: string
  icon: React.ElementType
  description: string
}[] = [
  {
    key: "aura",
    label: "Mais Aura",
    icon: Flame,
    description: "Top 100 usuários por Aura — reputação ganha com curtidas da comunidade.",
  },
  {
    key: "active",
    label: "Mais Ativos",
    icon: Activity,
    description: "Quem mais participa por aqui: posts, comentários e reações recentes.",
  },
  {
    key: "visited",
    label: "Mais visitados",
    icon: Eye,
    description: "Os perfis que mais chamaram atenção — ordenados por visitas.",
  },
  {
    key: "followed",
    label: "Mais seguidos",
    icon: Users,
    description: "Quem tem a maior torcida: perfis com mais seguidores na Sunano.",
  },
  {
    key: "following",
    label: "Seguindo",
    icon: Heart,
    description: "Os perfis que você segue, todos reunidos num só lugar.",
  },
]

/** As quatro primeiras abas são rankings; "Seguindo" é uma lista pessoal. */
const RANKED_TABS: DirectorySort[] = ["aura", "active", "visited", "followed"]

/**
 * Número que cada aba destaca no card. A busca e "Seguindo" não são rankings,
 * então caem em seguidores — o contador que faz sentido fora de uma disputa.
 */
const TAB_METRIC: Record<DirectorySort, DirectoryMetric> = {
  aura: "aura",
  active: "activity",
  visited: "views",
  followed: "followers",
  following: "followers",
}

export function PessoasContent({
  initialProfiles,
  followedIds,
  currentUserId,
}: {
  initialProfiles: PublicProfileSummary[]
  followedIds: string[]
  currentUserId: string | null
}) {
  const [tab, setTab] = useState<DirectorySort>("aura")
  const [profiles, setProfiles] = useState(initialProfiles)
  const [loading, setLoading] = useState(false)
  const [requiresAuth, setRequiresAuth] = useState(false)
  // Acumula o que já se sabe: cada aba traz o estado dos seus perfis,
  // e o conjunto cresce em vez de descartar o que veio antes.
  const [following, setFollowing] = useState(() => new Set(followedIds))
  // A primeira aba já veio renderizada pelo servidor — não refaz o fetch dela.
  const hydrated = useRef(true)

  useEffect(() => {
    if (hydrated.current) {
      hydrated.current = false
      return
    }
    let active = true
    // Mesmo padrão (e mesmo aviso pré-existente) de SidebarRankingSection.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/users/directory?sort=${tab}&limit=48`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return
        setProfiles(data.profiles ?? [])
        setRequiresAuth(Boolean(data.requiresAuth))
        setFollowing((prev) => new Set([...prev, ...((data.followedIds ?? []) as string[])]))
      })
      .catch(() => {
        if (active) setProfiles([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [tab])

  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0]
  const shown = profiles
  const isRanked = RANKED_TABS.includes(tab)
  const metric: DirectoryMetric = TAB_METRIC[tab]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      {/* Título + descrição da aba ativa fora do card, abas soltas embaixo —
          sem borda envolvendo os dois juntos. */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl border",
            activeTab.key === "aura"
              ? "border-orange-500/30 bg-orange-500/10 text-orange-500"
              : "border-border bg-muted/40 text-foreground"
          )}
        >
          <activeTab.icon
            className="size-5"
            {...(activeTab.key === "aura" ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
          />
        </span>
        <div>
          <p className="text-base font-bold leading-tight text-foreground">{activeTab.label}</p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{activeTab.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.key
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-[232px] animate-pulse rounded-2xl border border-border bg-muted/20"
              />
            ))}
          </div>
        ) : requiresAuth ? (
          <EmptyState
            icon={UserPlus}
            title="Entre para ver quem você segue"
            description="Sua lista de perfis seguidos aparece aqui depois do login."
            action={{ href: "/login", label: "Entrar" }}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={tab === "following" ? Heart : Users}
            title={
              tab === "following" ? "Você ainda não segue ninguém" : "Nenhum membro por aqui ainda"
            }
            description={
              tab === "following"
                ? "Encontre pessoas nas outras abas e toque em Seguir."
                : undefined
            }
          />
        ) : (
          <>
            {isRanked && shown.length >= 3 && (
              <div className="mb-8">
                <PodiumSection
                  profiles={shown.slice(0, 3)}
                  metric={metric}
                  following={following}
                  currentUserId={currentUserId}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {(isRanked && shown.length >= 3 ? shown.slice(3) : shown).map((profile, index) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  metric={metric}
                  rank={isRanked ? index + (shown.length >= 3 ? 4 : 1) : undefined}
                  isFollowing={following.has(profile.id)}
                  isSelf={profile.id === currentUserId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType
  title: string
  description?: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-4 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
