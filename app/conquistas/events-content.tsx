"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Medal, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { EventCard } from "@/components/events/EventCard"
import { AchievementsGrid } from "@/components/profile/AchievementsGrid"
import { YoutubeSubscribeButton } from "@/components/auth/YoutubeSubscribeButton"
import { DiscordMembershipButton } from "@/components/auth/DiscordMembershipButton"
import { notifyAuraChanged } from "@/lib/client/aura-events"
import { auraPriceForVip } from "@/lib/aura-pricing"
import type { EventDisplay } from "@/lib/events"
import type { AchievementTrack, ShowcaseAchievement } from "@/lib/achievements"

interface EventsContentProps {
  initialEvents: EventDisplay[]
  initialClaimedMedalIds: string[]
  initialAuraBalance: number
  isLoggedIn: boolean
  /** VIP ativo agora — medalhas de `aura_redeem` saem 10% mais baratas. */
  isVip: boolean
  /** Conquistas gerais (posts/comentários/seguidores) já desbloqueadas — vazio quando deslogado. */
  achievements: ShowcaseAchievement[]
  achievementCounts: Record<AchievementTrack, number>
  youtubeEnabled: boolean
  youtubeConfirmed: boolean
  discordEnabled: boolean
  discordConfirmed: boolean
}

/**
 * Client Component da página `/conquistas`: mantém o estado local dos eventos
 * (contador de vagas, status) para atualização otimista após um resgate
 * manual, no mesmo espírito de `LikeButton`/`forum-content.tsx` — sem
 * depender de revalidar a página inteira a cada clique. `auraBalance`
 * segue o mesmo padrão: decrementado otimisticamente num resgate
 * `aura_redeem`, reconciliado com o evento retornado pela API.
 */
export function EventsContent({
  initialEvents,
  initialClaimedMedalIds,
  initialAuraBalance,
  isLoggedIn,
  isVip,
  achievements,
  achievementCounts,
  youtubeEnabled,
  youtubeConfirmed: initialYoutubeConfirmed,
  discordEnabled,
  discordConfirmed: initialDiscordConfirmed,
}: EventsContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [events, setEvents] = useState(initialEvents)
  const [claimedMedalIds, setClaimedMedalIds] = useState(() => new Set(initialClaimedMedalIds))
  const [auraBalance, setAuraBalance] = useState(initialAuraBalance)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [youtubeConfirmed, setYoutubeConfirmed] = useState(initialYoutubeConfirmed)
  const [discordConfirmed, setDiscordConfirmed] = useState(initialDiscordConfirmed)

  // Feedback do redirect de app/auth/youtube/callback/route.ts (usuário pode
  // ter iniciado o fluxo daqui em vez de /aura).
  useEffect(() => {
    if (!youtubeEnabled) return
    const youtubeStatus = searchParams.get("youtube")
    if (!youtubeStatus) return
    if (youtubeStatus === "confirmed") {
      toast.success("Inscrição confirmada! +50 de Aura e a conquista Inscrito.")
      setYoutubeConfirmed(true)
      setAuraBalance((prev) => prev + 50)
      notifyAuraChanged()
    } else if (youtubeStatus === "not_subscribed") {
      toast.error("Não encontramos sua inscrição no canal. Inscreva-se e tente de novo.")
    } else {
      toast.error("Não foi possível confirmar sua inscrição. Tente novamente.")
    }
    router.replace("/conquistas", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Idem para app/auth/discord/callback/route.ts — o fluxo pode ter começado
  // aqui em vez de /aura.
  useEffect(() => {
    if (!discordEnabled) return
    const discordStatus = searchParams.get("discord")
    if (!discordStatus) return
    if (discordStatus === "confirmed") {
      toast.success("Discord conectado! +50 de Aura e a conquista No Discord.")
      setDiscordConfirmed(true)
      setAuraBalance((prev) => prev + 50)
      notifyAuraChanged()
    } else if (discordStatus === "already") {
      toast.info("Você já tinha resgatado essa conquista.")
      setDiscordConfirmed(true)
    } else if (discordStatus === "not_member") {
      toast.error("Não encontramos você no nosso servidor do Discord. Entre no servidor e tente de novo.")
    } else if (discordStatus === "account_in_use") {
      toast.error("Essa conta do Discord já foi usada por outro usuário.")
    } else if (discordStatus === "canceled") {
      toast.error("Você cancelou a autorização do Discord.")
    } else {
      toast.error("Não foi possível confirmar seu Discord. Tente novamente.")
    }
    router.replace("/conquistas", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const { active, ended } = useMemo(() => {
    const active: EventDisplay[] = []
    const ended: EventDisplay[] = []
    for (const event of events) (event.active ? active : ended).push(event)
    return { active, ended }
  }, [events])

  async function handleClaim(event: EventDisplay) {
    if (pendingId) return

    if (!isLoggedIn) {
      router.push("/login")
      return
    }

    setPendingId(event.id)
    try {
      const res = await fetch(`/api/conquistas/${event.id}/claim`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as { event?: EventDisplay; error?: string } | null

      if (res.status === 401) {
        router.push("/login")
        return
      }

      if (!res.ok || !data?.event) {
        toast.error(data?.error ?? "Não foi possível resgatar essa medalha.")
        return
      }

      setEvents((prev) => prev.map((e) => (e.id === event.id ? data.event! : e)))
      setClaimedMedalIds((prev) => new Set(prev).add(event.medalId))
      if (event.criteriaType === "aura_redeem" && event.auraCost) {
        // Decremento otimista tem que usar o preço com desconto — quem cobrou
        // foi `claim_event_medal`, que já aplicou o 10% do VIP.
        const paid = auraPriceForVip(event.auraCost, isVip).finalPrice
        setAuraBalance((prev) => prev - paid)
        notifyAuraChanged()
      }
      toast.success("Medalha resgatada!", { description: event.name })
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-2 py-6 sm:px-4 md:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Conquistas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medalhas por tempo ou vagas limitadas. Quanto mais rara a carta, mais ela brilha.
        </p>
      </div>

      {isLoggedIn && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Gerais
            </h2>
          </div>
          <AchievementsGrid
            achievements={achievements}
            counts={achievementCounts}
            showTitle={false}
            youtubeSubscribed={youtubeEnabled ? youtubeConfirmed : undefined}
            discordMember={discordEnabled ? discordConfirmed : undefined}
          />
          {youtubeEnabled && !youtubeConfirmed && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-600/30 bg-red-600/5 px-4 py-3">
              <p className="flex-1 text-sm text-foreground">
                Ganhe uma conquista especial por ser inscrito no nosso canal, só rola uma vez! <span className="font-bold text-red-500">+50 de Aura</span>
              </p>
              <YoutubeSubscribeButton />
            </div>
          )}
          {discordEnabled && !discordConfirmed && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#5865F2]/30 bg-[#5865F2]/5 px-4 py-3">
              <p className="flex-1 text-sm text-foreground">
                Conecte seu Discord e confirme que está no nosso servidor, só rola uma vez! <span className="font-bold text-[#5865F2]">+50 de Aura</span>
              </p>
              <DiscordMembershipButton />
            </div>
          )}
        </section>
      )}

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/50 py-16 text-center">
          <Medal className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum evento no momento. Volte em breve!</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Eventos em andamento
                </h2>
              </div>
              <div className="flex flex-wrap gap-6">
                {active.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    claimed={claimedMedalIds.has(event.medalId)}
                    isLoggedIn={isLoggedIn}
                    auraBalance={auraBalance}
                    isVip={isVip}
                    pending={pendingId === event.id}
                    onClaim={() => handleClaim(event)}
                  />
                ))}
              </div>
            </section>
          )}

          {ended.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Medal className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Eventos encerrados
                </h2>
              </div>
              <div className="flex flex-wrap gap-6">
                {ended.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    claimed={claimedMedalIds.has(event.medalId)}
                    isLoggedIn={isLoggedIn}
                    auraBalance={auraBalance}
                    isVip={isVip}
                    pending={false}
                    onClaim={() => handleClaim(event)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
