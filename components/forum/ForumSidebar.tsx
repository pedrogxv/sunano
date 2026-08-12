"use client"

import { useState } from "react"
import Link from "next/link"
import { Activity, Flame, ShieldCheck, UserCog } from "lucide-react"

import { DiscordIcon } from "@/components/auth/provider-icons"
import { PersonAvatar } from "@/components/people/PersonAvatar"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { profilePath } from "@/lib/profile-name"
import { SOCIAL_LINKS } from "@/lib/social-links"
import type { PublicProfileSummary } from "@/lib/user-directory"

const RULES = [
  "Proibido NSFW, discurso de ódio ou comportamento tóxico.",
  "Sem spam, flood ou publicidade para benefício próprio sem autorização da moderação.",
  "Não divulgue informações pessoais de outros membros — ações legais podem ser tomadas, com colaboração do site.",
  "Respeite os demais membros do fórum.",
  "Seja inscrito no canal do YouTube 🥹",
]

const discordLink = SOCIAL_LINKS.find((l) => l.label === "Discord")

function DescriptionCard() {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Flame className="size-4 shrink-0 text-orange-500" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">Fórum</h2>
      </div>
      <p className="text-xs leading-relaxed text-foreground">
        Nosso espaço para vocês farmarem Aura 🔥
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        Interaja e Reaja para receber ou perder Aura, dúvidas são sempre bem vindas!!
      </p>
    </section>
  )
}

/** Linha de avatar + nome reaproveitada pelo ranking e pela lista de moderadores. */
function ProfileRow({ profile, place }: { profile: PublicProfileSummary; place?: number }) {
  return (
    <MiniProfileHoverCard slug={profile.display_slug} side="left">
      <Link
        href={profilePath(profile.display_slug)}
        className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-muted/40"
      >
        {place !== undefined && (
          <span
            data-place={place}
            className="podium-metal flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
          >
            <span className="podium-number">{place}</span>
          </span>
        )}
        <PersonAvatar profile={profile} size="sm" />
        <span className="truncate text-xs font-semibold text-foreground">{profile.display_name}</span>
      </Link>
    </MiniProfileHoverCard>
  )
}

function ActiveUsersCard({ profiles }: { profiles: PublicProfileSummary[] }) {
  if (profiles.length === 0) return null
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">Mais Ativos</h2>
      </div>
      <ul className="space-y-1.5">
        {profiles.map((profile, index) => (
          <li key={profile.id}>
            <ProfileRow profile={profile} place={index + 1} />
          </li>
        ))}
      </ul>
      <Link href="/pessoas" className="mt-3 inline-block text-[11px] font-medium text-primary hover:underline">
        Ver ranking completo →
      </Link>
    </section>
  )
}

function RulesCard() {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">
          Regras do Fórum
        </h2>
      </div>
      <ol className="space-y-2.5">
        {RULES.map((rule, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-0.5 shrink-0 font-semibold text-primary">{i + 1}.</span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
      <Link
        href="/termos#regras-de-conduta"
        className="mt-3 inline-block text-[11px] font-medium text-primary hover:underline"
      >
        Ver termos completos →
      </Link>
    </section>
  )
}

function ModeratorsCard({ moderators }: { moderators: PublicProfileSummary[] }) {
  if (moderators.length === 0) return null
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserCog className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">Moderadores</h2>
      </div>
      <ul className="space-y-1.5">
        {moderators.map((profile) => (
          <li key={profile.id}>
            <ProfileRow profile={profile} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CommunityCard() {
  if (!discordLink) return null
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <DiscordIcon className="size-4 shrink-0" />
        <h2 className="font-display text-sm font-bold tracking-tight text-foreground">
          Comunidade
        </h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Bata um papo em tempo real, tire dúvidas e acompanhe as novidades no nosso Discord.
      </p>
      <a
        href={discordLink.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5865F2] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#4752C4]"
      >
        <DiscordIcon className="size-4 shrink-0" fill="#ffffff" />
        Entrar no Discord
      </a>
    </section>
  )
}

type ForumSidebarProps = {
  topActive: PublicProfileSummary[]
  moderators: PublicProfileSummary[]
}

/**
 * Coluna fixa e sticky ao lado da lista de posts — telas `lg`+.
 * Ganha scroll próprio (`max-h` + `overflow-y-auto`) porque, sem isso, o
 * sticky recorta contra o viewport quando a soma dos cards é mais alta que
 * a tela — a única forma de ver o resto era rolar a página inteira até o
 * fim, escondendo cards como "Moderadores" no meio do caminho.
 */
export function ForumSidebar({ topActive, moderators }: ForumSidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
      <div className="space-y-4 pb-1">
        <DescriptionCard />
        <ActiveUsersCard profiles={topActive} />
        <RulesCard />
        <ModeratorsCard moderators={moderators} />
        <CommunityCard />
      </div>
    </aside>
  )
}

/** Botão que abre o mesmo conteúdo em um dialog — telas abaixo de `lg`. */
export function ForumSidebarMobileTrigger({ topActive, moderators }: ForumSidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-border"
        onClick={() => setOpen(true)}
      >
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        Sobre o Fórum
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto sm:max-w-sm">
          <DialogTitle className="sr-only">Sobre o Fórum</DialogTitle>
          <div className="space-y-4 pt-2">
            <DescriptionCard />
            <ActiveUsersCard profiles={topActive} />
            <RulesCard />
            <ModeratorsCard moderators={moderators} />
            <CommunityCard />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
