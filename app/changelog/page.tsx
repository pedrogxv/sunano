"use client"

import { PatchNotes } from "@/components/changelog/PatchNotes"
import { useT } from "@/lib/use-t"

export default function ChangelogPage() {
  const t = useT()
  return (
    <PatchNotes
      title={t.changelog.title}
      description={t.changelog.description}
      entries={t.changelog.entries}
    />
  )
}
