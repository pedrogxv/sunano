"use client"

import { Changelog1, type ChangelogEntry } from "@/components/ui/changelog-1"
import { useT } from "@/lib/use-t"

export default function ChangelogPage() {
  const t = useT()
  const entries: ChangelogEntry[] = [
    {
      version: "beta",
      date: t.changelog.betaDate,
      title: t.changelog.betaTitle,
      description: t.changelog.betaDescription,
      items: t.changelog.betaItems,
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80",
    },
  ]

  return (
    <Changelog1
      title={t.changelog.title}
      description={t.changelog.description}
      entries={entries}
    />
  )
}
