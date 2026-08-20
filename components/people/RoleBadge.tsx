"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/use-t"
import type { AdminRole } from "@/lib/admin-permissions"

type Translations = ReturnType<typeof useT>

/** Estilo visual por cargo, na mesma ordem de poder de ADMIN_ROLE_ORDER (+ "user" no fim). */
const ROLE_BADGE_STYLE: Record<AdminRole | "user", string> = {
  webmaster: "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20",
  admin: "bg-primary/20 text-primary border-primary/30 hover:bg-primary/20",
  moderator: "bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/20",
  editor: "bg-sky-500/20 text-sky-300 border-sky-500/30 hover:bg-sky-500/20",
  vendedor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20",
  suporte: "bg-orange-500/20 text-orange-300 border-orange-500/30 hover:bg-orange-500/20",
  user: "border-border text-muted-foreground",
}

/** Rótulo do cargo, centralizado aqui para não duplicar a tradução em cada tela que exibe um cargo. */
export function adminRoleLabel(t: Translations, role: AdminRole | "user"): string {
  return t.admin.users[role]
}

/** Selo de cargo administrativo, usado em Usuários e nos autores de Notícias. */
export function RoleBadge({ role, className }: { role: AdminRole | "user"; className?: string }) {
  const t = useT()
  return (
    <Badge className={cn(ROLE_BADGE_STYLE[role], className)}>
      {adminRoleLabel(t, role)}
    </Badge>
  )
}
