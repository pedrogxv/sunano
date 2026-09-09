"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { useT } from "@/lib/use-t"

export function BackButton() {
  const router = useRouter()
  const t = useT()
  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="size-4" />
      {t.pageHeader.back}
    </button>
  )
}
