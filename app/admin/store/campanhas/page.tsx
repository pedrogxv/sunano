"use client"

import { useEffect, useState } from "react"
import { AlertCircle, AlertTriangle, CalendarClock, PartyPopper, Plus, ShoppingBag } from "lucide-react"

import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { RouteLink } from "@/components/ui/route-link"
import { formatShortDateTime } from "@/lib/datetime-local"
import type { AdminStoreCampaignSummary } from "@/lib/server/repositories/store-campaigns-repository"
import {
  STORE_CAMPAIGN_STATUS_LABEL,
  STORE_CAMPAIGN_THEME,
  storeCampaignStatus,
  type StoreCampaignStatus,
} from "@/lib/store-campaigns"
import { cn } from "@/lib/utils"

const STATUS_CLASS: Record<StoreCampaignStatus, string> = {
  live: "bg-emerald-500/10 text-emerald-400",
  scheduled: "bg-sky-500/10 text-sky-400",
  ended: "bg-slate-500/10 text-muted-foreground",
  disabled: "bg-slate-500/10 text-muted-foreground",
}

export default function AdminStoreCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdminStoreCampaignSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  usePageHeader(
    "Campanhas",
    "Black Friday, Natal, Páscoa: seção com contador e produtos escolhidos no topo da Loja."
  )

  useEffect(() => {
    let active = true
    fetch("/api/admin/store-campaigns")
      .then(async (res) => {
        const data = (await res.json()) as { campaigns?: AdminStoreCampaignSummary[]; error?: string }
        if (!res.ok || !data.campaigns) throw new Error(data.error ?? "Erro ao carregar as campanhas.")
        if (active) setCampaigns(data.campaigns)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar as campanhas.")
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="max-w-xl text-xs text-muted-foreground">
          Uma campanha no ar aparece no topo da Loja, acima dos Destaques, com o tema escolhido e um contador até
          o fim. Ela entra e sai sozinha pelo período; só pode haver uma ligada por vez.
        </p>
        <Button asChild className="gap-1.5">
          <RouteLink href="/admin/store/campanhas/nova">
            <Plus className="size-4" />
            Nova campanha
          </RouteLink>
        </Button>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}

      {!campaigns && !error && <div className="h-32 animate-pulse rounded-xl bg-muted/40" />}

      {campaigns?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <PartyPopper className="size-6 text-muted-foreground" />
          <p className="text-sm text-foreground">Nenhuma campanha ainda.</p>
          <p className="text-xs text-muted-foreground">Crie a primeira e escolha os produtos que entram nela.</p>
        </div>
      )}

      {campaigns && campaigns.length > 0 && (
        <ul className="space-y-2">
          {campaigns.map((campaign) => {
            const theme = STORE_CAMPAIGN_THEME[campaign.theme]
            const status = storeCampaignStatus(campaign, now)
            const willShowEmpty = campaign.productCount === 0 && (status === "live" || status === "scheduled")
            return (
              <li key={campaign.id}>
                <RouteLink
                  href={`/admin/store/campanhas/${campaign.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/25"
                >
                  <span className={cn("size-10 shrink-0 rounded-lg", theme.swatch)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {campaign.title}
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_CLASS[status])}>
                        {STORE_CAMPAIGN_STATUS_LABEL[status]}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{theme.label}</span>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3" />
                        {formatShortDateTime(campaign.startsAt)} até {formatShortDateTime(campaign.endsAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="size-3" />
                        {campaign.productCount} {campaign.productCount === 1 ? "produto" : "produtos"}
                      </span>
                    </p>
                    {willShowEmpty && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-400">
                        <AlertTriangle className="size-3" />
                        Sem produtos: não aparece na Loja.
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">Editar</span>
                </RouteLink>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
