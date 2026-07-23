"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PenSquare } from "lucide-react"

/** Atalho de criação exibido apenas para quem tem perfil admin. */
export function NewNewsButton() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (mounted) setIsAdmin(Boolean(d?.adminProfile)) })
      .catch(() => { if (mounted) setIsAdmin(false) })
    return () => { mounted = false }
  }, [])

  if (!isAdmin) return null

  return (
    <Link
      href="/admin/blog/new"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <PenSquare className="size-4" />
      <span className="hidden sm:inline">Nova notícia</span>
    </Link>
  )
}
