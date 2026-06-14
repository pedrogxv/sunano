"use client"

import Link from "next/link"
import { ArrowRight, BarChart3, CheckCircle2, NotebookPen, Package, Plus, Sparkles, Trophy, Users } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useT } from "@/lib/use-t"
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
  const t = useT()
  const quickActions = [
    {
      href: "/admin/tierlist/new",
      label: t.admin.dashboard.addTierListItem,
      description: t.admin.dashboard.createTierListItem,
      icon: Plus,
      color: "cyan",
    },
    {
      href: "/admin/tierlist",
      label: t.admin.dashboard.viewTierList,
      description: t.admin.dashboard.organizeTierList,
      icon: Trophy,
      color: "emerald",
    },
    {
      href: "/admin/blog",
      label: t.admin.dashboard.writePost,
      description: t.admin.dashboard.publishUpdates,
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
              {t.admin.dashboard.organizationArea}
            </p>
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {t.admin.dashboard.whatToDo}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {t.admin.dashboard.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {t.admin.dashboard.quickShortcuts}
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
          {t.admin.dashboard.quickSummary}
        </h2>

        <Card className="border-border bg-card">
          <CardContent className="space-y-4 p-5 md:p-6">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <Package className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{t.admin.dashboard.tierListItems}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.admin.dashboard.tierListItemsDesc}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <NotebookPen className="mt-0.5 size-5 text-amber-300" />
              <div>
                <p className="text-sm font-medium text-foreground">{t.admin.dashboard.contentLabel}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.admin.dashboard.contentDesc}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <Users className="mt-0.5 size-5 text-emerald-300" />
              <div>
                <p className="text-sm font-medium text-foreground">{t.admin.dashboard.visitorExperience}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.admin.dashboard.visitorExperienceDesc}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {t.admin.dashboard.usefulTips}
        </h2>

        <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5">
          <CardContent className="space-y-3 p-5 md:p-6">
            <p className="flex items-start gap-3 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{t.admin.dashboard.tipSimple}</span>
            </p>
            <p className="flex items-start gap-3 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{t.admin.dashboard.tipImages}</span>
            </p>
            <p className="flex items-start gap-3 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{t.admin.dashboard.tipReview}</span>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
