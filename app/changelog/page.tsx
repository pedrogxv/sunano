"use client"

import { Changelog1, type ChangelogEntry } from "@/components/ui/changelog-1"
import { useLocale } from "@/lib/locale-context"

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "beta",
    date: "Em construção",
    title: "Beta em andamento",
    description:
      "Versao beta atual da plataforma, sendo refinada antes do primeiro release estavel.",
    items: [
      "Layout beta em refinamento",
      "Ajustes de tierlist, admin e navegacao em andamento",
      "Melhorias visuais e de consistencia ainda sendo aplicadas",
      "Base preparada para evoluir para o primeiro release estavel",
    ],
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80",
  },
]

export default function ChangelogPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const entries: ChangelogEntry[] = isEnglish
    ? [
      {
        version: "beta",
        date: "In progress",
        title: "Beta ongoing",
        description: "Current beta version of the platform, being refined before the first stable release.",
        items: [
          "Beta layout under refinement",
          "Tierlist, admin, and navigation improvements in progress",
          "Visual and consistency improvements still being applied",
          "Foundation ready to evolve into the first stable release",
        ],
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80",
      },
    ]
    : CHANGELOG_ENTRIES

  return (

    <Changelog1
      title="Changelog"
      description={isEnglish ? "Only the current beta version is under construction." : "Apenas a versao beta atual em construcao."}
      entries={entries}
    />
  )
}
