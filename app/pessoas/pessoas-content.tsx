"use client"

import Link from "next/link"
import {
  Activity,
  Bird,
  Eye,
  Flame,
  Heart,
  UserPlus,
  Users,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { PeriodFilter, periodLabel } from "@/components/people/PeriodFilter"
import { PodiumSection } from "@/components/people/PodiumSection"
import { ProfileCard } from "@/components/people/ProfileCard"
import { useAuthUser } from "@/components/providers/auth-context"
import { cn } from "@/lib/utils"
import {
  PERIOD_AWARE_SORTS,
  type DirectoryMetric,
  type DirectoryPeriod,
  type DirectorySort,
  type PublicProfileSummary,
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
    description:
      "Top 100 usuários por Aura — reputação ganha com curtidas da comunidade.",
  },
  {
    key: "active",
    label: "Mais Ativos",
    icon: Activity,
    description:
      "Top 100 usuários mais ativos: posts, comentários e reações recentes.",
  },
  {
    key: "visited",
    label: "Mais visitados",
    icon: Eye,
    description:
      "Top 100 perfis que mais chamaram atenção — ordenados por visitas.",
  },
  {
    key: "followed",
    label: "Mais seguidos",
    icon: Users,
    description: "Top 100 perfis com mais seguidores na Sunano.",
  },
  {
    key: "streak",
    label: "Maiores Ofensivas",
    icon: Bird,
    description:
      "Top 100 usuários com a maior ofensiva ativa — dias seguidos completando as missões diárias.",
  },
  {
    key: "following",
    label: "Seguindo",
    icon: Heart,
    description: "Os perfis que você segue, todos reunidos num só lugar.",
  },
]

/** As cinco primeiras abas são rankings; "Seguindo" é uma lista pessoal. */
const RANKED_TABS: DirectorySort[] = [
  "aura",
  "active",
  "visited",
  "followed",
  "streak",
]

/**
 * Número que cada aba destaca no card. A busca e "Seguindo" não são rankings,
 * então caem em seguidores — o contador que faz sentido fora de uma disputa.
 */
const TAB_METRIC: Record<DirectorySort, DirectoryMetric> = {
  aura: "aura",
  active: "activity",
  visited: "views",
  followed: "followers",
  streak: "streak",
  following: "followers",
}

export function PessoasContent({
  initialProfiles,
}: {
  initialProfiles: PublicProfileSummary[]
}) {
  // A página é estática (CDN); quem está logado sai do contexto de auth já
  // resolvido uma vez na raiz do app, sem custo de sessão no SSR desta rota.
  const { user } = useAuthUser()
  const currentUserId = user?.id ?? null

  const [tab, setTab] = useState<DirectorySort>("aura")
  const [period, setPeriod] = useState<DirectoryPeriod>("all")
  const [profiles, setProfiles] = useState(initialProfiles)
  const [loading, setLoading] = useState(false)
  const [requiresAuth, setRequiresAuth] = useState(false)
  // Acumula o que já se sabe: cada aba/fetch de "quem eu sigo" cresce o conjunto
  // em vez de descartar o que veio antes.
  const [following, setFollowing] = useState<Set<string>>(() => new Set())
  // A primeira aba já veio renderizada pelo servidor — não refaz o fetch dela.
  const hydrated = useRef(true)

  // O período só faz sentido nas abas Aura/Ativos; ao sair delas volta pra "all"
  // pra não carregar um filtro invisível pra dentro da próxima aba.
  const supportsPeriod = PERIOD_AWARE_SORTS.includes(tab)
  const effectivePeriod: DirectoryPeriod = supportsPeriod ? period : "all"

  useEffect(() => {
    if (!supportsPeriod && period !== "all") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPeriod("all")
    }
  }, [supportsPeriod, period])

  // Resolve "quem eu sigo" para a lista atualmente na tela. Cobre a aba inicial
  // (hidratada pelo servidor, sem passar pelo fetch abaixo) e o login feito com
  // a página já aberta. É um GET minúsculo (uma linha indexada de user_follows)
  // e não fura o cache de CDN do ranking, que continua público.
  useEffect(() => {
    if (!currentUserId || tab === "following" || profiles.length === 0) return
    let active = true
    const ids = profiles.map((p) => p.id).join(",")
    fetch(`/api/users/follows/among?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((f) => {
        if (!active) return
        setFollowing(
          (prev) => new Set([...prev, ...((f.followedIds ?? []) as string[])])
        )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [currentUserId, tab, profiles])

  useEffect(() => {
    if (hydrated.current) {
      hydrated.current = false
      return
    }
    let active = true
    // Mesmo padrão (e mesmo aviso pré-existente) de SidebarRankingSection.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const params = new URLSearchParams({ sort: tab, limit: "100" })
    if (effectivePeriod !== "all") params.set("period", effectivePeriod)
    // O ranking é público e cacheado no CDN. "Quem eu sigo" (o único dado por
    // usuário) é resolvido no effect dedicado acima — exceto na aba "Seguindo",
    // onde a lista JÁ é, por definição, só quem o visitante segue.
    fetch(`/api/users/directory?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return
        const list = (data.profiles ?? []) as PublicProfileSummary[]
        setProfiles(list)
        setRequiresAuth(Boolean(data.requiresAuth))
        if (data.sort === "following") {
          setFollowing((prev) => new Set([...prev, ...list.map((p) => p.id)]))
        }
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
  }, [tab, effectivePeriod])

  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0]
  const shown = profiles
  const isRanked = RANKED_TABS.includes(tab)
  const metric: DirectoryMetric = TAB_METRIC[tab]

  // Descrição da aba: com um período ativo, troca a frase padrão por uma que
  // deixa claro que o recorte é temporal (senão o "Top 100 por Aura" contradiz
  // a lista, que agora é "quem mais ganhou hoje").
  const description =
    supportsPeriod && effectivePeriod !== "all"
      ? tab === "aura"
        ? `Quem mais ganhou Aura ${periodLabel(effectivePeriod)} — reputação em alta na comunidade.`
        : `Quem mais postou e comentou ${periodLabel(effectivePeriod)} no fórum e nas notícias.`
      : activeTab.description

  return (
    <div className="mx-auto max-w-6xl px-2 py-6 sm:px-4 md:px-6 md:py-8">
      {/* Título + descrição da aba ativa fora do card, abas soltas embaixo —
          sem borda envolvendo os dois juntos. */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl border",
            activeTab.key === "aura"
              ? "border-orange-500/30 bg-orange-500/10 text-orange-500"
              : activeTab.key === "streak"
                ? "border-red-500/30 bg-red-500/10 text-red-500"
                : "border-border bg-muted/40 text-foreground"
          )}
        >
          <activeTab.icon
            className="size-5"
            {...(activeTab.key === "aura"
              ? { fill: "currentColor", strokeWidth: 1.5 }
              : {})}
          />
        </span>
        <div>
          <p className="text-base leading-tight font-bold text-foreground">
            {activeTab.label}
          </p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
            {description}
          </p>
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

      {/* Filtro de período — só nas abas com recorte temporal (Aura / Ativos).
          Entra/sai suave pra a barra de abas não "pular" ao trocar de aba. */}
      <div
        className={cn(
          "grid overflow-hidden transition-all duration-300 ease-out",
          supportsPeriod
            ? "mt-4 grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="flex min-h-0 justify-center">
          <PeriodFilter value={period} onChange={setPeriod} loading={loading} />
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
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
              tab === "following"
                ? "Você ainda não segue ninguém"
                : "Nenhum membro por aqui ainda"
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
                  period={effectivePeriod}
                  following={following}
                  currentUserId={currentUserId}
                  showFollowButton={
                    tab === "visited" ||
                    tab === "followed" ||
                    tab === "following"
                  }
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
              {(isRanked && shown.length >= 3 ? shown.slice(3) : shown).map(
                (profile, index) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    metric={metric}
                    period={effectivePeriod}
                    rank={
                      isRanked ? index + (shown.length >= 3 ? 4 : 1) : undefined
                    }
                    isFollowing={following.has(profile.id)}
                    isSelf={profile.id === currentUserId}
                    showFollowButton={
                      tab === "visited" ||
                      tab === "followed" ||
                      tab === "following"
                    }
                  />
                )
              )}
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
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          {description}
        </p>
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
