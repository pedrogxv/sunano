"use client"

import Link from "next/link"
import { ArrowRight, BarChart3, CheckCircle2, NotebookPen, Package, Plus, Sparkles, Users } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"

const COLOR_STYLES = {
  cyan: {
    border: "border-cyan-500/30",
    bg: "from-cyan-500/10 to-cyan-500/5",
    hoverBorder: "hover:border-cyan-400/50",
    hoverBg: "hover:from-cyan-500/15 hover:to-cyan-500/10",
    iconBg: "bg-cyan-500/20 group-hover:bg-cyan-500/30",
    iconText: "text-cyan-300",
  },
  emerald: {
    border: "border-emerald-500/30",
    bg: "from-emerald-500/10 to-emerald-500/5",
    hoverBorder: "hover:border-emerald-400/50",
    hoverBg: "hover:from-emerald-500/15 hover:to-emerald-500/10",
    iconBg: "bg-emerald-500/20 group-hover:bg-emerald-500/30",
    iconText: "text-emerald-300",
  },
  amber: {
    border: "border-amber-500/30",
    bg: "from-amber-500/10 to-amber-500/5",
    hoverBorder: "hover:border-amber-400/50",
    hoverBg: "hover:from-amber-500/15 hover:to-amber-500/10",
    iconBg: "bg-amber-500/20 group-hover:bg-amber-500/30",
    iconText: "text-amber-300",
  },
}

export default function AdminPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const quickActions = [
    {
      href: "/admin/peripherals/new",
      label: isEnglish ? "Add Tier List item" : "Adicionar item da Tier List",
      description: isEnglish ? "Create a new tier list item" : "Crie um novo item da tier list",
      icon: Plus,
      color: "cyan",
    },
    {
      href: "/admin/peripherals",
      label: isEnglish ? "View Tier List" : "Ver Tier List",
      description: isEnglish ? "Organize the current ranking" : "Organize o ranking atual",
      icon: Package,
      color: "emerald",
    },
    {
      href: "/admin/blog",
      label: isEnglish ? "Write post" : "Escrever post",
      description: isEnglish ? "Publish updates and analysis" : "Publique novidades e análises",
      icon: NotebookPen,
      color: "amber",
    },
  ]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div className="relative p-6 md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.08),transparent_28%)]" />
          <div className="relative max-w-3xl space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="size-3.5" />
              {isEnglish ? "Organization area" : "Área de organização"}
            </p>
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {isEnglish ? "What do you want to do today?" : "O que você quer fazer hoje?"}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {isEnglish
                  ? "Choose a quick action below to update the site, publish content, or review what is already live."
                  : "Escolha uma ação rápida abaixo para atualizar o site, publicar conteúdo ou revisar o que já está no ar."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {isEnglish ? "Quick shortcuts" : "Atalhos rápidos"}
        </h2>
        <div className="space-y-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            const styles = COLOR_STYLES[action.color as keyof typeof COLOR_STYLES]

            return (
              <Link key={action.href} href={action.href} className="group block">
                <Card
                  className={cn(
                    "border bg-gradient-to-br transition-all cursor-pointer",
                    styles.border,
                    styles.bg,
                    styles.hoverBorder,
                    styles.hoverBg
                  )}
                >
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0 p-5 md:p-6">
                    <div
                      className={cn(
                        "inline-flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors",
                        styles.iconBg
                      )}
                    >
                      <Icon className={cn("size-5", styles.iconText)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base text-foreground md:text-lg">{action.label}</CardTitle>
                      <CardDescription className="mt-1 text-sm text-muted-foreground">
                        {action.description}
                      </CardDescription>
                    </div>
                    <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                  </CardHeader>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {isEnglish ? "Quick summary" : "Resumo rápido"}
        </h2>

        <Card className="border-border bg-card">
          <CardContent className="space-y-4 p-5 md:p-6">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <Package className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{isEnglish ? "Tier List items" : "Itens da Tier List"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{isEnglish ? "20 items ready for review and adjustments." : "20 itens prontos para revisão e ajustes."}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <NotebookPen className="mt-0.5 size-5 text-amber-300" />
              <div>
                <p className="text-sm font-medium text-foreground">{isEnglish ? "Content" : "Conteúdo"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{isEnglish ? "You can create new posts or update existing ones." : "Você pode criar novos posts ou atualizar os existentes."}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <Users className="mt-0.5 size-5 text-emerald-300" />
              <div>
                <p className="text-sm font-medium text-foreground">Experiência do visitante</p>
                <p className="mt-1 text-sm text-muted-foreground">{isEnglish ? "When done, return to the site to review the public experience." : "Quando terminar, volte ao site para conferir como ficou para o público."}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {isEnglish ? "Useful tips" : "Dicas úteis"}
        </h2>

        <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5">
          <CardContent className="space-y-3 p-5 md:p-6">
            <p className="flex items-start gap-3 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{isEnglish ? "Keep names and descriptions simple for better readability." : "Mantenha os nomes e descrições simples para facilitar a leitura."}</span>
            </p>
            <p className="flex items-start gap-3 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{isEnglish ? "Use images and short text to keep pages cleaner." : "Use imagens e textos curtos para deixar a página mais agradável."}</span>
            </p>
            <p className="flex items-start gap-3 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{isEnglish ? "Review before publishing to avoid rework." : "Revise antes de publicar para evitar retrabalho."}</span>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
