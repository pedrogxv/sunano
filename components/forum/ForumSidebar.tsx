"use client"

import { useState } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { DiscordIcon } from "@/components/auth/provider-icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { SOCIAL_LINKS } from "@/lib/social-links"

const RULES = [
  "Não publique conteúdo ilegal, difamatório, obsceno, ameaçador ou discriminatório.",
  "Nada de spam, flood ou publicidade não autorizada.",
  "Não se passe por outros usuários ou pelo Sunano.",
  "Não tente acessar áreas restritas ou sistemas sem autorização.",
  "Respeite direitos autorais e propriedade intelectual de terceiros.",
]

const discordLink = SOCIAL_LINKS.find((l) => l.label === "Discord")

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

/** Coluna fixa e sticky ao lado da lista de posts — telas `lg`+. */
export function ForumSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 space-y-4 lg:block lg:sticky lg:top-6 lg:self-start">
      <RulesCard />
      <CommunityCard />
    </aside>
  )
}

/** Botão que abre o mesmo conteúdo em um dialog — telas abaixo de `lg`. */
export function ForumSidebarMobileTrigger() {
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
        Regras e Comunidade
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto sm:max-w-sm">
          <DialogTitle className="sr-only">Regras e Comunidade</DialogTitle>
          <div className="space-y-4 pt-2">
            <RulesCard />
            <CommunityCard />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
