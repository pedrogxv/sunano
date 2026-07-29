"use client"

import { Flag, Layers, Rocket, ShieldCheck } from "lucide-react"

import { Changelog1, type ChangelogColor, type ChangelogEntry } from "@/components/ui/changelog-1"
import { useT } from "@/lib/use-t"

// Um ícone + cor por período, na mesma ordem (mais recente primeiro) das
// entradas em lib/i18n.ts — julho, junho, maio, abril.
const PERIOD_STYLE: { icon: ChangelogEntry["icon"]; color: ChangelogColor }[] = [
  { icon: Rocket, color: "emerald" },
  { icon: ShieldCheck, color: "violet" },
  { icon: Layers, color: "amber" },
  { icon: Flag, color: "cyan" },
]

export default function ChangelogPage() {
  const t = useT()
  const entries: ChangelogEntry[] = t.changelog.entries.map((entry, index) => ({
    ...entry,
    ...PERIOD_STYLE[index % PERIOD_STYLE.length],
  }))

  return (
    <Changelog1
      title={t.changelog.title}
      description={t.changelog.description}
      entries={entries}
    />
  )
}
