"use client"

import { useMemo, useState } from "react"
import { Clock, Info, ListChecks, Star, Tag } from "lucide-react"

import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

type InfoTab = {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  content: React.ReactNode
}

export function TierlistInfo() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<string>("about")

  const tabs = useMemo<InfoTab[]>(() => {
    return [
      {
        id: "about",
        title: t.tierlist.about.title,
        icon: Info,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t.tierlist.about.p1}</p>
            <p>{t.tierlist.about.p2}</p>
          </div>
        ),
      },
      {
        id: "categories",
        title: t.tierlist.categoriesTab.title,
        icon: Tag,
        content: (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{t.tierlist.categoriesTab.primaryTags}</p>
              <ul className="space-y-1.5 text-muted-foreground">
              <li>{t.tierlist.categoriesTab.competitive}</li>
              <li>{t.tierlist.categoriesTab.bomba}</li>
              <li>{t.tierlist.categoriesTab.value}</li>
            </ul>
          </div>
        ),
      },
      {
        id: "tiers",
        title: t.tierlist.tiers.title,
        icon: Star,
        content: (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t.tierlist.tiers.goatSS}</p>
            <p>{t.tierlist.tiers.sa}</p>
            <p>{t.tierlist.tiers.bcl}</p>
          </div>
        ),
      },
      {
        id: "criteria",
        title: t.tierlist.criteria.title,
        icon: ListChecks,
        content: (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t.tierlist.criteria.intro}</p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>{t.tierlist.criteria.item1}</li>
              <li>{t.tierlist.criteria.item2}</li>
              <li>{t.tierlist.criteria.item3}</li>
              <li>{t.tierlist.criteria.item4}</li>
            </ul>
          </div>
        ),
      },
      {
        id: "update",
        title: t.tierlist.latestUpdate.title,
        icon: Clock,
        content: (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-primary">{t.tierlist.latestUpdate.month}</p>
              <p>{t.tierlist.latestUpdate.description}</p>
            </div>
        ),
      },
    ]
  }, [t])

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="size-2 rounded-sm bg-primary" />
          {t.tierlist.info}
        </h2>
      </div>

      <div className="flex overflow-x-auto border-b border-border bg-muted/20">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{tab.title}</span>
            </button>
          )
        })}
      </div>

      <div className="p-4 md:p-5">{activeContent.content}</div>
    </section>
  )
}
