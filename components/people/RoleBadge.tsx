"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/use-t"

/** Selo de cargo administrativo (WEB Master/Admin/Moderador), usado em Usuários e nos autores de Notícias. */
export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const t = useT()
  if (role === "webmaster") {
    return (
      <Badge className={cn("bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20", className)}>
        WEB Master
      </Badge>
    )
  }
  if (role === "admin") {
    return (
      <Badge className={cn("bg-primary/20 text-primary border-primary/30 hover:bg-primary/20", className)}>
        Admin
      </Badge>
    )
  }
  if (role === "moderator") {
    return <Badge variant="secondary" className={className}>{t.admin.users.moderator}</Badge>
  }
  return <Badge variant="outline" className={cn("border-border text-muted-foreground", className)}>{t.admin.users.user}</Badge>
}
